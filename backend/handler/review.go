package handler

import (
	"bufio"
	"bytes"
	"context"
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

// DeepSeek v4 是推理模型，思考过程也计入 max_tokens。原先 1024 / 1500 经常被思考用光，
// 正文写到一半甚至一个字都没写就被截断。实测一个稍复杂的问题需要约 6500（思考约 5000）。
const aiMaxTokens = 8192

// 复盘流式回答的整体时长上限；Pro 模型思考可能长达数分钟
const reviewStreamMaxDuration = 10 * time.Minute

// 思考阶段的保活间隔，需远小于 nginx proxy_read_timeout（300s）
const streamKeepAliveInterval = 15 * time.Second

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

【分清是哪类睡眠问题（看数据里的睡眠效率）】
- 效率高（≥85%%）但入睡晚：是「拖延入睡」——躺下能睡着，只是迟迟不去睡。重点聊睡前在做什么（尤其手机）、为什么不愿结束这一天，鼓励手机离开卧室等可控动作。
- 效率低（<85%%）、夜里醒着的时间多：才是失眠倾向，可以聊固定起床时间、睡不着就离床等做法。
- 没有效率数据时不要下判断，直接问用户。

【认知重建（CBT-I）】
当用户流露对睡眠的灾难化想法，例如「今晚再睡不着明天就完了」「晚睡一次这周全毁了」「我就是改不掉」：
- 先共情，再温和地点出这是往最坏处想，引导他用事实检验（比如：以前睡得少的第二天，真的「完了」吗？）
- 帮他换一个更平衡的说法（例如「今晚睡得少一点，明天会累，但我扛得住」）
- 提醒「越用力想睡越睡不着」，把注意力放回能做的动作上：固定时间起床、到点放下手机，而不是逼自己马上睡着
- 不要用扣分、后果去吓唬用户，那会加重睡前的紧张

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
6. 用户的作息锚点是「固定起床时间」（工作日和周末都一样）。提到作息时优先关注起床时间是否稳定，而不只是几点睡
7. 当用户说"结束复盘"或"总结一下"时，生成一段今日总结，格式如下：
   【今日总结】
   （100字以内，语气温暖，包含：睡眠情况、能量状态、一个值得关注的行为或情绪、对睡眠根因的一点温柔观察、一句给明天的鼓励。总结里的数字同样必须来自真实数据，不得编造）

【今日真实数据】（以下均为系统从数据库读取，是唯一可信来源）
%s`

const defaultGoals = `（暂未设置，请在数据库中写入 goals 配置）`

// ── DeepSeek API 结构 ──────────────────────────────────────────────────────

type DSMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	// 以下为 tool-calling 用（复盘对话不填，omitempty 保证不影响原行为）
	ToolCalls  []DSToolCall `json:"tool_calls,omitempty"`  // assistant 发起的工具调用
	ToolCallID string       `json:"tool_call_id,omitempty"` // role=tool 时对应的调用 id
	Name       string       `json:"name,omitempty"`         // role=tool 时的工具名
}

type DSToolCall struct {
	ID       string         `json:"id"`
	Type     string         `json:"type"` // 恒为 "function"
	Function DSFunctionCall `json:"function"`
}

type DSFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON 字符串
}

type DSRequest struct {
	Model       string      `json:"model"`
	Messages    []DSMessage `json:"messages"`
	Temperature float64     `json:"temperature"`
	MaxTokens   int         `json:"max_tokens"`
	Stream      bool        `json:"stream"`
	Tools       []DSTool    `json:"tools,omitempty"`
	ToolChoice  string      `json:"tool_choice,omitempty"`
}

type DSResponse struct {
	Choices []struct {
		Message      DSMessage `json:"message"`
		FinishReason string    `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

type DSStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content          string `json:"content"`
			ReasoningContent string `json:"reasoning_content"` // 推理模型的思考过程，不展示，只用来判断「还在思考」
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
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

		// 用请求自身的 context：用户点「停止」或关页面时，上游 DeepSeek 请求一并取消
		ctx, cancel := context.WithTimeout(c.Request.Context(), reviewStreamMaxDuration)
		defer cancel()
		dsResp, err := startDeepSeekStream(ctx, apiKey, model, messages)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer dsResp.Close()

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Accel-Buffering", "no")

		scanner := bufio.NewScanner(dsResp)
		lastWrite := time.Now()
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
			choice := chunk.Choices[0]
			// 达到长度上限：告诉用户是被截断了，而不是让回答悄悄停在半句
			if choice.FinishReason == "length" {
				payload, _ := json.Marshal(map[string]string{"token": "\n\n（回答达到长度上限被截断了，可以说「接着说」让我继续。）"})
				fmt.Fprintf(w, "data: %s\n\n", payload)
				return true
			}
			content := choice.Delta.Content
			if content == "" {
				// 推理模型思考阶段只有 reasoning_content、没有正文。这段时间不往前端写任何字节的话，
				// nginx 会按 proxy_read_timeout（300s）把连接断掉，所以定期发一个 SSE 注释保活（前端会忽略）
				if time.Since(lastWrite) > streamKeepAliveInterval {
					fmt.Fprint(w, ": thinking\n\n")
					lastWrite = time.Now()
				}
				return true
			}
			payload, _ := json.Marshal(map[string]string{"token": content})
			fmt.Fprintf(w, "data: %s\n\n", payload)
			lastWrite = time.Now()
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

// energyLabels 对齐 Garmin 睡眠分数四档分级
var energyLabels = map[int]string{1: "差", 2: "一般", 3: "良好", 4: "优秀"}

// energyDesc 渲染能量：有 Garmin 原始分数时一并给出，让教练能引用真实分数
func energyDesc(level, score int) string {
	label := energyLabels[level]
	if score > 0 {
		return fmt.Sprintf("%s（Garmin 睡眠分数 %d）", label, score)
	}
	return label
}

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
		sb.WriteString(fmt.Sprintf("- 睡眠质量：%s\n", energyDesc(todayEnergy.EnergyLevel, todayEnergy.SleepScore)))
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
		Where("datetime(completed_at) >= datetime(?) AND datetime(completed_at) < datetime(?)", todayStart, todayEnd).
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
			line := fmt.Sprintf("- %s %s 入睡 %s，起床 %s，%.1fh", mmdd(s.Date), wd, s.SleepTime, s.WakeTime, s.Duration)
			if total := s.AsleepMinutes + s.AwakeMinutes; s.AsleepMinutes > 0 && total > 0 {
				line += fmt.Sprintf("，效率 %.0f%%（夜间清醒 %d 分钟）", float64(s.AsleepMinutes)*100/float64(total), s.AwakeMinutes)
			}
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
			sb.WriteString(fmt.Sprintf("- %s %s\n", mmdd(e.Date), energyDesc(e.EnergyLevel, e.SleepScore)))
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
	sb.WriteString(fmt.Sprintf("固定起床时间：%s（工作日和周末相同）\n", getConfig(db, fixedWakeConfigKey, fixedWakeDefault)))

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

// streamClient 流式请求专用。不能用 http.Client.Timeout：它把读响应体的时间也算进去，
// 流式回答超过这个时长会被半路掐断。这里只限制「等到响应头」的时间，整体时长由调用方的 ctx 控制。
var streamClient = func() *http.Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = 60 * time.Second
	return &http.Client{Transport: t}
}()

// startDeepSeekStream 发起流式请求，返回 response body（调用方负责 Close）
func startDeepSeekStream(ctx context.Context, apiKey string, model string, messages []DSMessage) (io.ReadCloser, error) {
	reqBody := DSRequest{
		Model:    model,
		Messages: messages,
		// 0.6：教练语气的温暖由 prompt 保证，这里压低采样温度以减少数据幻觉
		Temperature: 0.6,
		MaxTokens:   aiMaxTokens,
		Stream:      true,
	}

	body, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", deepseekEndpoint, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := streamClient.Do(httpReq)
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
