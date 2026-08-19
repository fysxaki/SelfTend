package handler

import (
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"

	"selftend/model"
)

// ── 工具定义（喂给 DeepSeek 的 tools 字段）────────────────────────────────────

type DSTool struct {
	Type     string         `json:"type"` // 恒为 "function"
	Function DSToolFunction `json:"function"`
}

type DSToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"` // JSON Schema
}

// AgentProposal 待用户确认的写操作方案（agent 不直接执行，交前端确认后调现有接口）
type AgentProposal struct {
	ActionType   string         `json:"action_type"`   // complete_task / log_energy / add_worry / redeem_prize
	Params       map[string]any `json:"params"`        // 前端调用现有接口所需参数
	HumanSummary string         `json:"human_summary"` // 给用户看的一句话
}

// 写工具：只生成 proposal、绝不自动落库
var writeToolNames = map[string]bool{
	"complete_task": true,
	"log_energy":    true,
	"log_sleep":     true,
	"add_worry":     true,
	"redeem_prize":  true,
}

func isWriteTool(name string) bool { return writeToolNames[name] }

// noParams 无参数工具的空 schema
func noParams() map[string]any {
	return map[string]any{"type": "object", "properties": map[string]any{}}
}

// agentTools 返回全部工具定义。读工具 agent 自动执行；写工具只提议。
func agentTools() []DSTool {
	fn := func(name, desc string, params map[string]any) DSTool {
		return DSTool{Type: "function", Function: DSToolFunction{Name: name, Description: desc, Parameters: params}}
	}
	return []DSTool{
		// ── 读工具 ──
		fn("get_stats", "获取用户档案：总积分、可用积分、等级、连续打卡天数", noParams()),
		fn("get_today", "获取今日快照：今日睡眠、今日能量、今日已完成任务数与获得积分", noParams()),
		fn("get_recent_sleep", "获取最近若干天的睡眠记录（入睡时间/时长/晚睡惩罚）", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"days": map[string]any{"type": "integer", "description": "天数，默认 14"},
			},
		}),
		fn("get_recent_energy", "获取最近若干天的每日能量记录（1-5）", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"days": map[string]any{"type": "integer", "description": "天数，默认 14"},
			},
		}),
		fn("get_tasks", "获取当前赛季的任务列表，以及今天已完成的任务 id", noParams()),
		fn("get_worries", "获取焦虑暂存箱里未处理的念头", noParams()),
		fn("get_wishes", "获取心愿列表（进行中/已还清）", noParams()),
		fn("get_redemptions", "获取最近的奖励兑换记录", noParams()),
		// ── 写工具（只提议，需用户确认）──
		fn("complete_task", "为用户完成一个任务并发放积分。参数 task_id 必填。", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"task_id": map[string]any{"type": "integer", "description": "要完成的任务 id"},
				"note":    map[string]any{"type": "string", "description": "可选备注"},
			},
			"required": []string{"task_id"},
		}),
		fn("log_energy", "记录今日能量值（1-5）。", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"energy_level": map[string]any{"type": "integer", "description": "能量值 1-5"},
				"note":         map[string]any{"type": "string", "description": "可选备注"},
			},
			"required": []string{"energy_level"},
		}),
		fn("log_sleep", "记录某天的睡眠。date 是起床那天（不填=今天；用户说昨天/某天时，按【今天】日期推算并填上 YYYY-MM-DD）。", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sleep_time": map[string]any{"type": "string", "description": "入睡时间 HH:MM，如 23:30"},
				"wake_time":  map[string]any{"type": "string", "description": "起床时间 HH:MM，如 08:00，可选（不填用默认 08:52）"},
				"date":       map[string]any{"type": "string", "description": "起床那天日期 YYYY-MM-DD，可选"},
			},
			"required": []string{"sleep_time"},
		}),
		fn("add_worry", "把一个焦虑念头放进暂存箱，指定一个未来处理日期。", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"content":     map[string]any{"type": "string", "description": "焦虑的念头内容"},
				"handle_date": map[string]any{"type": "string", "description": "计划处理日期 YYYY-MM-DD，不填默认明天"},
			},
			"required": []string{"content"},
		}),
		fn("redeem_prize", "用可用积分兑换一个奖品。参数 prize_id 必填。", map[string]any{
			"type": "object",
			"properties": map[string]any{
				"prize_id": map[string]any{"type": "integer", "description": "要兑换的奖品 id"},
			},
			"required": []string{"prize_id"},
		}),
	}
}

// ── 读工具执行：直接查库，返回 JSON 字符串塞回对话 ────────────────────────────

func toJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf(`{"error":%q}`, err.Error())
	}
	return string(b)
}

// executeReadTool 执行读工具，返回给模型的结果文本
func executeReadTool(db *gorm.DB, name, argsJSON string) string {
	switch name {
	case "get_stats":
		var stats model.UserStats
		db.First(&stats)
		return toJSON(stats)

	case "get_today":
		today := time.Now().In(cst).Format("2006-01-02")
		res := map[string]any{"date": today}
		var sleep model.SleepLog
		if db.Where("date = ?", today).First(&sleep).Error == nil {
			res["sleep"] = sleep
		} else {
			res["sleep"] = nil
		}
		var energy model.EnergyLog
		if db.Where("date = ?", today).First(&energy).Error == nil {
			res["energy"] = energy
		} else {
			res["energy"] = nil
		}
		dayStart, _ := time.ParseInLocation("2006-01-02", today, cst)
		dayEnd := dayStart.Add(24 * time.Hour)
		var logs []model.TaskLog
		db.Where("completed_at >= ? AND completed_at < ?", dayStart.UTC(), dayEnd.UTC()).Find(&logs)
		var earned float64
		for _, l := range logs {
			earned += l.ExpAwarded
		}
		res["tasks_completed_today"] = len(logs)
		res["exp_earned_today"] = earned
		return toJSON(res)

	case "get_recent_sleep":
		days := parseDays(argsJSON, 14)
		cutoff := time.Now().In(cst).AddDate(0, 0, -(days - 1)).Format("2006-01-02")
		var logs []model.SleepLog
		db.Where("date >= ?", cutoff).Order("date desc").Find(&logs)
		return toJSON(logs)

	case "get_recent_energy":
		days := parseDays(argsJSON, 14)
		cutoff := time.Now().In(cst).AddDate(0, 0, -(days - 1)).Format("2006-01-02")
		var logs []model.EnergyLog
		db.Where("date >= ?", cutoff).Order("date desc").Find(&logs)
		return toJSON(logs)

	case "get_tasks":
		var season model.Season
		if err := db.Order("id desc").First(&season).Error; err != nil {
			return toJSON(map[string]any{"tasks": []any{}})
		}
		var tasks []model.Task
		db.Where("season_id = ?", season.ID).Order("sort_order asc").Find(&tasks)
		// 今日已完成的任务 id
		today := time.Now().In(cst).Format("2006-01-02")
		dayStart, _ := time.ParseInLocation("2006-01-02", today, cst)
		dayEnd := dayStart.Add(24 * time.Hour)
		var logs []model.TaskLog
		db.Where("completed_at >= ? AND completed_at < ?", dayStart.UTC(), dayEnd.UTC()).Find(&logs)
		ids := make([]uint, 0, len(logs))
		for _, l := range logs {
			ids = append(ids, l.TaskID)
		}
		return toJSON(map[string]any{"season": season.Name, "tasks": tasks, "completed_today_task_ids": ids})

	case "get_worries":
		var ws []model.WorryNote
		db.Where("resolved = ?", false).Order("handle_date asc").Find(&ws)
		return toJSON(ws)

	case "get_wishes":
		var ws []model.Wish
		db.Order("status asc, created_at desc").Find(&ws)
		return toJSON(ws)

	case "get_redemptions":
		var rs []model.RedemptionLog
		db.Order("redeemed_at desc").Limit(50).Find(&rs)
		return toJSON(rs)

	default:
		return fmt.Sprintf(`{"error":"unknown read tool %q"}`, name)
	}
}

func parseDays(argsJSON string, def int) int {
	var a struct {
		Days int `json:"days"`
	}
	if json.Unmarshal([]byte(argsJSON), &a) == nil && a.Days > 0 {
		return a.Days
	}
	return def
}

// ── 写工具：只构造 proposal，不落库 ──────────────────────────────────────────

// buildProposal 把写工具调用转成待确认方案。err 用于把参数问题回喂给模型自我纠正。
func buildProposal(db *gorm.DB, name, argsJSON string) (AgentProposal, error) {
	switch name {
	case "complete_task":
		var a struct {
			TaskID uint   `json:"task_id"`
			Note   string `json:"note"`
		}
		json.Unmarshal([]byte(argsJSON), &a)
		if a.TaskID == 0 {
			return AgentProposal{}, fmt.Errorf("task_id 缺失")
		}
		var t model.Task
		if err := db.First(&t, a.TaskID).Error; err != nil {
			return AgentProposal{}, fmt.Errorf("任务 id=%d 不存在", a.TaskID)
		}
		return AgentProposal{
			ActionType:   "complete_task",
			Params:       map[string]any{"task_id": a.TaskID, "note": a.Note},
			HumanSummary: fmt.Sprintf("完成任务「%s」，预计 +%.1f 分", t.Title, t.ExpReward),
		}, nil

	case "log_energy":
		var a struct {
			EnergyLevel int    `json:"energy_level"`
			Note        string `json:"note"`
		}
		json.Unmarshal([]byte(argsJSON), &a)
		if a.EnergyLevel < 1 || a.EnergyLevel > 5 {
			return AgentProposal{}, fmt.Errorf("energy_level 需为 1-5")
		}
		return AgentProposal{
			ActionType:   "log_energy",
			Params:       map[string]any{"energy_level": a.EnergyLevel, "note": a.Note},
			HumanSummary: fmt.Sprintf("记录今日能量为 %d/5", a.EnergyLevel),
		}, nil

	case "log_sleep":
		var a struct {
			SleepTime string `json:"sleep_time"`
			WakeTime  string `json:"wake_time"`
			Date      string `json:"date"`
		}
		json.Unmarshal([]byte(argsJSON), &a)
		if a.SleepTime == "" {
			return AgentProposal{}, fmt.Errorf("sleep_time 缺失（几点入睡）")
		}
		whenLabel := a.Date
		if whenLabel == "" {
			whenLabel = "今天"
		}
		wakeLabel := a.WakeTime
		if wakeLabel == "" {
			wakeLabel = "默认起床(08:52)"
		}
		return AgentProposal{
			ActionType:   "log_sleep",
			Params:       map[string]any{"date": a.Date, "sleep_time": a.SleepTime, "wake_time": a.WakeTime},
			HumanSummary: fmt.Sprintf("记录 %s 睡眠：%s 入睡、%s 起床", whenLabel, a.SleepTime, wakeLabel),
		}, nil

	case "add_worry":
		var a struct {
			Content    string `json:"content"`
			HandleDate string `json:"handle_date"`
		}
		json.Unmarshal([]byte(argsJSON), &a)
		if a.Content == "" {
			return AgentProposal{}, fmt.Errorf("content 缺失")
		}
		when := a.HandleDate
		if when == "" {
			when = "明天"
		}
		return AgentProposal{
			ActionType:   "add_worry",
			Params:       map[string]any{"content": a.Content, "handle_date": a.HandleDate},
			HumanSummary: fmt.Sprintf("把「%s」放进焦虑暂存箱，计划 %s 处理", a.Content, when),
		}, nil

	case "redeem_prize":
		var a struct {
			PrizeID uint `json:"prize_id"`
		}
		json.Unmarshal([]byte(argsJSON), &a)
		if a.PrizeID == 0 {
			return AgentProposal{}, fmt.Errorf("prize_id 缺失")
		}
		var p model.Prize
		if err := db.First(&p, a.PrizeID).Error; err != nil {
			return AgentProposal{}, fmt.Errorf("奖品 id=%d 不存在", a.PrizeID)
		}
		if p.Redeemed {
			return AgentProposal{}, fmt.Errorf("奖品「%s」已被兑换过", p.Name)
		}
		return AgentProposal{
			ActionType:   "redeem_prize",
			Params:       map[string]any{"prize_id": a.PrizeID},
			HumanSummary: fmt.Sprintf("兑换奖品「%s」，花费 %.0f 分", p.Name, p.Cost),
		}, nil

	default:
		return AgentProposal{}, fmt.Errorf("unknown write tool %q", name)
	}
}
