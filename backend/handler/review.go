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
每日睡前复盘教练。风格直接，不回避问题，可以追问任何话题。

【任务】
1. 结合今日数据（睡眠、能量、任务完成情况）给出具体反馈
2. 引导用户反思今天发生了什么、情绪状态如何
3. 帮助用户看到行为模式（比如熬夜的触发因素）
4. 在合适时机将今日情况与用户的大目标关联
5. 对话中保持简洁，不要说废话
6. 当用户说"结束复盘"或"总结一下"时，生成一段今日总结，格式如下：
   【今日总结】
   （100字以内，包含：睡眠情况、能量状态、一个值得关注的行为或情绪、一句给明天的话）

【今日数据】
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

// buildContext 查询最近数据，生成上下文字符串注入 prompt
func buildContext(db *gorm.DB) string {
	today := time.Now().In(cst).Format("2006-01-02")
	weekAgo := time.Now().In(cst).AddDate(0, 0, -6).Format("2006-01-02")

	// 今日睡眠
	var todaySleep model.SleepLog
	sleepStr := "暂无记录"
	if err := db.Where("date = ?", today).First(&todaySleep).Error; err == nil {
		sleepStr = fmt.Sprintf("入睡 %s，时长 %.1f 小时", todaySleep.SleepTime, todaySleep.Duration)
		if todaySleep.Penalized {
			sleepStr += fmt.Sprintf("（超时惩罚 -%.1f 积分）", todaySleep.PenaltyExp)
		}
	}

	// 今日能量
	var todayEnergy model.EnergyLog
	energyStr := "暂无记录"
	if err := db.Where("date = ?", today).First(&todayEnergy).Error; err == nil {
		labels := map[int]string{1: "很差", 2: "较差", 3: "一般", 4: "不错", 5: "满血"}
		energyStr = fmt.Sprintf("%d/5（%s）", todayEnergy.EnergyLevel, labels[todayEnergy.EnergyLevel])
	}

	// 今日任务完成情况
	todayStart, todayEnd := todayRangeUTC()
	type taskResult struct {
		Count int
		Total float64
	}
	var tr taskResult
	db.Model(&model.TaskLog{}).
		Select("COUNT(*) as count, COALESCE(SUM(exp_awarded), 0) as total").
		Where("completed_at >= ? AND completed_at < ?", todayStart, todayEnd).
		Scan(&tr)
	taskStr := fmt.Sprintf("完成 %d 条任务，获得 %.1f 积分", tr.Count, tr.Total)

	// 近7天睡眠均值
	var sleepLogs []model.SleepLog
	db.Where("date >= ? AND date <= ?", weekAgo, today).Find(&sleepLogs)
	avgSleep := 0.0
	if len(sleepLogs) > 0 {
		for _, s := range sleepLogs {
			avgSleep += s.Duration
		}
		avgSleep /= float64(len(sleepLogs))
	}
	weekSleepStr := fmt.Sprintf("近7天平均睡眠 %.1f 小时（共记录 %d 天）", avgSleep, len(sleepLogs))

	// 用户积分和等级
	var stats model.UserStats
	db.First(&stats)
	statsStr := fmt.Sprintf("Lv.%d，总积分 %.0f，可用积分 %.0f，连续打卡 %d 天",
		stats.Level, stats.TotalExp, stats.SpendableExp, stats.CurrentStreak)

	return fmt.Sprintf(
		"日期：%s\n今日睡眠：%s\n今日能量：%s\n今日任务：%s\n%s\n用户状态：%s",
		today, sleepStr, energyStr, taskStr, weekSleepStr, statsStr,
	)
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
		Model:       model,
		Messages:    messages,
		Temperature: 0.8,
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
