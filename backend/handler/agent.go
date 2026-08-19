package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// agentSystemPrompt agent 的角色与工作方式。数据一律走工具实时拉取，禁止编造。
const agentSystemPrompt = `你是 SelfTend 的私人成长教练 Agent，能调用工具查询用户真实数据、或提议帮用户执行动作。

【用户背景】
%s

【用户目标】
%s

【工作方式】
- 需要数据时调用对应读工具拿真实数据，严禁编造任何数字或记录；数据不足就如实说明。
- 用户让你"帮忙做某事"（完成任务、记录能量、暂存焦虑、兑换奖品）时，调用对应写工具生成方案；这些动作需用户确认后才真正执行，你只负责提议，不要假装已经完成。
- 一次可以调用多个读工具把信息查齐再作答。
- 语气温和、简洁，像真正关心用户的朋友，用中文回答。`

// agent 循环上限，防止在慢速推理模型上无限往返
const agentMaxSteps = 5

// callDeepSeekNonStream 非流式请求，用于工具调用轮次。带 90s 超时兜死慢响应。
func callDeepSeekNonStream(apiKey, model string, messages []DSMessage, tools []DSTool) (*DSResponse, error) {
	reqBody := DSRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 0.5,
		MaxTokens:   1500,
		Stream:      false,
		Tools:       tools,
		ToolChoice:  "auto",
	}
	body, _ := json.Marshal(reqBody)
	httpReq, err := http.NewRequest("POST", deepseekEndpoint, bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求 DeepSeek 失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("DeepSeek HTTP %d: %s", resp.StatusCode, string(b))
	}
	var out DSResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("解析 DeepSeek 响应失败: %v", err)
	}
	if out.Error != nil {
		return nil, fmt.Errorf("%s", out.Error.Message)
	}
	return &out, nil
}

// AgentChat tool-calling agent：读工具自动执行、写工具收集为待确认方案，SSE 流式返回过程与结果。
func AgentChat(db *gorm.DB) gin.HandlerFunc {
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

		model := req.Model
		if model == "" {
			model = deepseekDefaultModel
		}

		background := getConfig(db, "background", "（暂未设置）")
		goals := getConfig(db, "goals", defaultGoals)
		messages := []DSMessage{{Role: "system", Content: fmt.Sprintf(agentSystemPrompt, background, goals)}}
		messages = append(messages, req.Messages...)

		tools := agentTools()

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("X-Accel-Buffering", "no")
		flusher, _ := c.Writer.(http.Flusher)
		send := func(v any) {
			b, _ := json.Marshal(v)
			fmt.Fprintf(c.Writer, "data: %s\n\n", b)
			if flusher != nil {
				flusher.Flush()
			}
		}
		done := func() {
			fmt.Fprint(c.Writer, "data: [DONE]\n\n")
			if flusher != nil {
				flusher.Flush()
			}
		}

		var proposals []AgentProposal
		seenProposal := map[string]bool{} // 去重，避免模型重复提同一动作
		finalText := ""

		for step := 0; step < agentMaxSteps; step++ {
			resp, err := callDeepSeekNonStream(apiKey, model, messages, tools)
			if err != nil {
				send(map[string]any{"type": "error", "error": err.Error()})
				done()
				return
			}
			if len(resp.Choices) == 0 {
				break
			}
			msg := resp.Choices[0].Message

			// 无工具调用 → 得到最终答复，收尾
			if len(msg.ToolCalls) == 0 {
				finalText = msg.Content
				break
			}

			// 把 assistant 的工具调用消息加入上下文
			messages = append(messages, msg)

			for _, tc := range msg.ToolCalls {
				send(map[string]any{"type": "step", "tool": tc.Function.Name})

				var result string
				if isWriteTool(tc.Function.Name) {
					p, perr := buildProposal(db, tc.Function.Name, tc.Function.Arguments)
					if perr != nil {
						result = fmt.Sprintf(`{"error":%q}`, perr.Error())
					} else {
						key := p.ActionType + "|" + toJSON(p.Params)
						if !seenProposal[key] {
							seenProposal[key] = true
							proposals = append(proposals, p)
						}
						result = `{"status":"已生成待用户确认的方案卡，请勿重复提交同一动作；可用一句话说明你的建议。"}`
					}
				} else {
					result = executeReadTool(db, tc.Function.Name, tc.Function.Arguments)
				}

				messages = append(messages, DSMessage{
					Role:       "tool",
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
					Content:    result,
				})
			}
		}

		if finalText == "" && len(proposals) == 0 {
			finalText = "抱歉，我这次没能想清楚，能再说一次你的需求吗？"
		}
		if finalText != "" {
			send(map[string]any{"type": "token", "token": finalText})
		}
		if len(proposals) > 0 {
			send(map[string]any{"type": "proposal", "actions": proposals})
		}
		done()
	}
}
