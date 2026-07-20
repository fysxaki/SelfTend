package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

const deepseekEndpoint = "https://api.deepseek.com/chat/completions"
const deepseekDefaultModel = "deepseek-v4-flash"

// ── System Prompt ──────────────────────────────────────────────────────────

const systemPromptBase = `你是一个私人成长教练。

【用户背景】
%s

【用户目标】
%s

【你的角色】
每日睡前复盘教练。温和、有耐心、不评判，像一个真正关心用户的朋友。
用商量和好奇的语气陪用户一起看今天，而不是质问或施压。
当用户做得不够好时，先肯定努力、理解处境，再温柔地一起探讨；
当用户状态低落时，优先给情绪支持，不要急着纠正行为。

【核心关注：睡眠不足的根本原因】
本复盘的重点是帮用户温和地找到「睡眠不足/熬夜」背后的真正原因，而不只是停留在表面。
- 用开放、好奇的提问，一层层往下问，引导用户自己发现根因（例如：是事情没做完？情绪需要放松？习惯性刷手机？还是白天某件事的影响？）
- 多问「今天是什么让你晚睡的呢？」「那时候你心里在想什么？」这类不带评判的问题
- 帮用户看见熬夜背后的触发因素和情绪需求，而不是简单地说"你该早点睡"
- 找到根因后，和用户一起想一个小而可行的改善方向，由他自己选择，不强加

【数据使用铁律 — 最高优先级，任何情况下不得违反】
1. 你只能引用下方【今日真实数据】里明确列出的数字和事实。这些是系统从数据库读取的真实记录。
2. 绝对禁止编造、推测、估算、假设任何数据——包括但不限于：入睡时间、睡眠时长、能量值、任务数量、积分、连续天数。
3. 如果某项显示"暂无记录"，你必须如实告诉用户"今天还没有记录这项"，然后可以温柔地邀请他去记录，绝不能虚构一个数字或说"你昨晚睡了X小时"这类没有依据的话。
4. 如果你需要某个数据但下方没有提供，就直接问用户，或说明"我这边还没看到这项记录"，宁可承认不知道，也不要猜。
5. 谈及任何具体数字前，先在心里核对它是否逐字出现在【今日真实数据】中；没有出现的，一律不说。

【任务】
1. 结合下方真实数据（睡眠、能量、任务完成情况）给出温和、具体的反馈，先肯定再建议
2. 用好奇而非质问的语气，引导用户反思今天发生了什么、情绪状态如何
3. 围绕睡眠，温柔地层层追问，陪用户一起找到熬夜/睡眠不足的根本原因
4. 在合适时机将今日情况与用户的大目标轻轻关联，给予鼓励
5. 对话中保持简洁温暖，避免说教和废话
6. 当用户说"结束复盘"或"总结一下"时，生成一段今日总结，格式如下：
   【今日总结】
   （100字以内，语气温暖，包含：睡眠情况、能量状态、一个值得关注的行为或情绪、对睡眠根因的一点温柔观察、一句给明天的鼓励。总结里的数字同样必须来自真实数据，不得编造）

【今日真实数据】（以下均为系统从数据库读取，是唯一可信来源）
%s`

const defaultGoals = `（暂未设置，请在数据库中写入 goals 配置）`

// ── DeepSeek API 结构 ──────────────────────────────────────────────────────

type DSMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type DSRequest struct {
	Model       string      `json:"model"`
	Messages    []DSMessage `json:"messages"`
	Temperature float64     `json:"temperature"`
	MaxTokens   int         `json:"max_tokens"`
	Stream      bool        `json:"stream"`
}

type DSResponse struct {
	Choices []struct {
		Message DSMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

type DSStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// ── Handlers ───────────────────────────────────────────────────────────────

type ChatReq struct {
	Messages []DSMessage `json:"messages"` // 前端维护完整对话历史
	Model    string      `json:"model"`    // 可选，默认 deepseek-v4-flash
}

// Chat 处理单轮对话，SSE 流式返回 AI 回复
func Chat(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := os.Getenv("DEEPSEEK_API_KEY")
		if apiKey == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "DEEPSEEK_API_KEY 未配置"})
			return
		}

		var req ChatReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		background := getConfig(db, "background", "（暂未设置）")
		goals := getConfig(db, "goals", defaultGoals)
		contextStr := buildContext(db)
		systemPrompt := fmt.Sprintf(systemPromptBase, background, goals, contextStr)

		messages := []DSMessage{{Role: "system", Content: systemPrompt}}
		messages = append(messages, req.Messages...)

		model := req.Model
		if model == "" {
			model = deepseekDefaultModel
		}

		dsResp, err := startDeepSeekStream(apiKey, model, messages)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer dsResp.Close()

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Accel-Buffering", "no")

		scanner := bufio.NewScanner(dsResp)
		c.Stream(func(w io.Writer) bool {
			if !scanner.Scan() {
				return false
			}
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				return true
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				return false
			}
			var chunk DSStreamChunk
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				return true
			}
			if chunk.Error != nil {
				fmt.Fprintf(w, "data: {\"error\":\"%s\"}\n\n", chunk.Error.Message)
				return false
			}
			if len(chunk.Choices) == 0 {
				return true
			}
			content := chunk.Choices[0].Delta.Content
			if content == "" {
				return true
			}
			payload, _ := json.Marshal(map[string]string{"token": content})
			fmt.Fprintf(w, "data: %s\n\n", payload)
			return true
		})
	}
}

type SaveReviewReq struct {
	Summary string `json:"summary"`
}

// SaveReview 保存今日复盘总结
func SaveReview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req SaveReviewReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Summary == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "summary 不能为空"})
			return
		}

		today := time.Now().In(cst).Format("2006-01-02")

		// 同一天只保留最新一条
		var existing model.ReviewLog
		if err := db.Where("date = ?", today).First(&existing).Error; err == nil {
			existing.Summary = req.Summary
			db.Save(&existing)
			c.JSON(http.StatusOK, existing)
			return
		}

		log := model.ReviewLog{Date: today, Summary: req.Summary}
		db.Create(&log)
		c.JSON(http.StatusOK, log)
	}
}

// GetReviews 获取历史复盘总结
func GetReviews(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limitStr := c.DefaultQuery("limit", "30")
		limit, _ := strconv.Atoi(limitStr)
		var logs []model.ReviewLog
		db.Order("date desc").Limit(limit).Find(&logs)
		c.JSON(http.StatusOK, logs)
	}
}

// ── 内部工具函数 ───────────────────────────────────────────────────────────

// 复盘上下文的历史窗口：14 天，与前端睡眠统计的生物钟窗口一致
const reviewWindowDays = 14

var energyLabels = map[int]string{1: "很差", 2: "较差", 3: "一般", 4: "不错", 5: "满血"}

// cnWeekday 返回中文星期几
func cnWeekday(t time.Time) string {
	names := []string{"周日", "周一", "周二", "周三", "周四", "周五", "周六"}
	return names[int(t.Weekday())]
}

// buildContext 查询最近数据，生成结构化上下文注入 prompt。
// 不只给今天，还给近 14 天的睡眠/能量明细、焦虑暂存箱、历史复盘小结，
// 让教练能看趋势、找根因、保持会话连续性。所有数据均来自 DB，绝不编造。
func buildContext(db *gorm.DB) string {
	now := time.Now().In(cst)
	today := now.Format("2006-01-02")
	windowStart := now.AddDate(0, 0, -(reviewWindowDays - 1)).Format("2006-01-02")

	var sb strings.Builder

	// ── 今日快照 ──
	sb.WriteString(fmt.Sprintf("【今日 %s %s】\n", today, cnWeekday(now)))

	var todaySleep model.SleepLog
	if err := db.Where("date = ?", today).First(&todaySleep).Error; err == nil {
		line := fmt.Sprintf("- 睡眠：入睡 %s，时长 %.1f 小时", todaySleep.SleepTime, todaySleep.Duration)
		if todaySleep.Penalized {
			line += fmt.Sprintf("（晚睡惩罚 -%.1f 积分）", todaySleep.PenaltyExp)
		}
		sb.WriteString(line + "\n")
	} else {
		sb.WriteString("- 睡眠：今天还没有记录\n")
	}

	var todayEnergy model.EnergyLog
	if err := db.Where("date = ?", today).First(&todayEnergy).Error; err == nil {
		sb.WriteString(fmt.Sprintf("- 能量：%d/5（%s）\n", todayEnergy.EnergyLevel, energyLabels[todayEnergy.EnergyLevel]))
	} else {
		sb.WriteString("- 能量：今天还没有记录\n")
	}

	todayStart, todayEnd := todayRangeUTC()
	var tr struct {
		Count int
		Total float64
	}
	db.Model(&model.TaskLog{}).
		Select("COUNT(*) as count, COALESCE(SUM(exp_awarded), 0) as total").
		Where("completed_at >= ? AND completed_at < ?", todayStart, todayEnd).
		Scan(&tr)
	sb.WriteString(fmt.Sprintf("- 任务：完成 %d 条，获得 %.1f 积分\n", tr.Count, tr.Total))

	// ── 近 N 天睡眠明细 ──
	var sleepLogs []model.SleepLog
	db.Where("date >= ? AND date <= ?", windowStart, today).Order("date desc").Find(&sleepLogs)
	sb.WriteString(fmt.Sprintf("\n【近 %d 天睡眠明细】\n", reviewWindowDays))
	if len(sleepLogs) == 0 {
		sb.WriteString("- 这段时间没有睡眠记录\n")
	} else {
		var sum float64
		for _, s := range sleepLogs {
			sum += s.Duration
			wd := ""
			if t, err := time.ParseInLocation("2006-01-02", s.Date, cst); err == nil {
				wd = cnWeekday(t)
			}
			line := fmt.Sprintf("- %s %s 入睡 %s，%.1fh", mmdd(s.Date), wd, s.SleepTime, s.Duration)
			if s.Penalized {
				line += " ⚠️晚睡"
			}
			sb.WriteString(line + "\n")
		}
		sb.WriteString(fmt.Sprintf("平均 %.1fh（共记录 %d 天）\n", sum/float64(len(sleepLogs)), len(sleepLogs)))
	}

	// ── 近 N 天能量 ──
	var energyLogs []model.EnergyLog
	db.Where("date >= ? AND date <= ?", windowStart, today).Order("date desc").Find(&energyLogs)
	if len(energyLogs) > 0 {
		sb.WriteString(fmt.Sprintf("\n【近 %d 天能量】\n", reviewWindowDays))
		for _, e := range energyLogs {
			sb.WriteString(fmt.Sprintf("- %s %d/5（%s）\n", mmdd(e.Date), e.EnergyLevel, energyLabels[e.EnergyLevel]))
		}
	}

	// ── 焦虑暂存箱（未处理）──
	var worries []model.WorryNote
	db.Where("resolved = ?", false).Order("handle_date asc").Limit(15).Find(&worries)
	if len(worries) > 0 {
		sb.WriteString("\n【最近挂心的事（焦虑暂存箱·未处理）】\n")
		for _, w := range worries {
			status := "暂存"
			if w.HandleDate <= today {
				status = "待处理"
			}
			sb.WriteString(fmt.Sprintf("- [%s] %s（计划 %s 处理）\n", status, w.Content, mmdd(w.HandleDate)))
		}
	}

	// ── 最近复盘小结（会话连续性）──
	var reviews []model.ReviewLog
	db.Order("date desc").Limit(3).Find(&reviews)
	if len(reviews) > 0 {
		sb.WriteString("\n【最近几次复盘小结】\n")
		for _, r := range reviews {
			sb.WriteString(fmt.Sprintf("- %s：%s\n", r.Date, r.Summary))
		}
	}

	// ── 用户档案 ──
	var stats model.UserStats
	db.First(&stats)
	sb.WriteString(fmt.Sprintf("\n【用户档案】\nLv.%d，总积分 %.0f，可用积分 %.0f，连续打卡 %d 天\n",
		stats.Level, stats.TotalExp, stats.SpendableExp, stats.CurrentStreak))

	return sb.String()
}

// mmdd 把 "2006-01-02" 缩成 "01-02"，容错非法输入
func mmdd(date string) string {
	if len(date) >= 10 {
		return date[5:10]
	}
	return date
}

// getConfig 从 user_configs 读取配置，不存在时返回 fallback
func getConfig(db *gorm.DB, key, fallback string) string {
	var cfg model.UserConfig
	if err := db.Where("key = ?", key).First(&cfg).Error; err != nil {
		return fallback
	}
	return cfg.Value
}

// startDeepSeekStream 发起流式请求，返回 response body（调用方负责 Close）
func startDeepSeekStream(apiKey string, model string, messages []DSMessage) (io.ReadCloser, error) {
	reqBody := DSRequest{
		Model:    model,
		Messages: messages,
		// 0.6：教练语气的温暖由 prompt 保证，这里压低采样温度以减少数据幻觉
		Temperature: 0.6,
		MaxTokens:   1024,
		Stream:      true,
	}

	body, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequest("POST", deepseekEndpoint, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求 DeepSeek 失败: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("DeepSeek HTTP %d: %s", resp.StatusCode, string(b))
	}
	return resp.Body, nil
}
