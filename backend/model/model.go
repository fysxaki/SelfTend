package model

import "time"

type Season struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name"`
	Theme     string    `json:"theme"`
	StartDate string    `json:"start_date"`
	EndDate   string    `json:"end_date"`
	CreatedAt time.Time `json:"created_at"`
}

type Task struct {
	ID          uint    `json:"id" gorm:"primaryKey"`
	SeasonID    uint    `json:"season_id"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Category    string  `json:"category"`  // health / work / life / mood
	Type        string  `json:"type"`      // daily / weekly / season
	Timing      string  `json:"timing"`    // morning / evening / both / out / anytime
	Difficulty  string  `json:"difficulty"` // easy / normal / hard
	ExpReward   float64 `json:"exp_reward"`
	SortOrder   int     `json:"sort_order"`
}

type TaskLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	TaskID      uint      `json:"task_id"`
	CompletedAt time.Time `json:"completed_at"`
	Note        string    `json:"note"`
	ExpAwarded  float64   `json:"exp_awarded"` // 实际发放的积分（早晚部分完成时可能与 task.ExpReward 不同）
}

type UserStats struct {
	ID             uint    `json:"id" gorm:"primaryKey"`
	TotalExp       float64 `json:"total_exp"`
	SpendableExp   float64 `json:"spendable_exp"`
	Level          int     `json:"level"`
	CurrentStreak  int     `json:"current_streak"`
	LongestStreak  int     `json:"longest_streak"`
	LastActiveDate string  `json:"last_active_date"`
}

type Prize struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Category    string     `json:"category"`
	Cost        float64    `json:"cost"`
	Redeemed    bool       `json:"redeemed"`
	RedeemedAt  *time.Time `json:"redeemed_at"`
}

// SleepLog 睡眠记录
type SleepLog struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	Date       string    `json:"date"`        // YYYY-MM-DD (CST)
	SleepTime  string    `json:"sleep_time"`  // HH:MM (CST)，入睡时间
	WakeTime   string    `json:"wake_time"`   // HH:MM (CST)，起床时间，默认 08:52
	Duration   float64   `json:"duration"`    // 睡眠时长（小时）
	Penalized  bool      `json:"penalized"`   // 是否触发晚睡惩罚
	PenaltyExp float64   `json:"penalty_exp"` // 晚睡扣除的积分
	BonusExp   float64   `json:"bonus_exp"`   // 时长奖励/惩罚：正数=奖励，负数=不足6小时惩罚
	CreatedAt  time.Time `json:"created_at"`
}

// EnergyLog 每日能量记录
type EnergyLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Date        string    `json:"date"`         // YYYY-MM-DD (CST)
	EnergyLevel int       `json:"energy_level"` // 1-5
	Note        string    `json:"note"`
	CreatedAt   time.Time `json:"created_at"`
}

// ReviewLog 每日复盘总结
type ReviewLog struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Date      string    `json:"date"`    // YYYY-MM-DD (CST)
	Summary   string    `json:"summary"` // AI 生成的总结
	CreatedAt time.Time `json:"created_at"`
}

// UserConfig 用户配置（key-value）
type UserConfig struct {
	ID    uint   `json:"id" gorm:"primaryKey"`
	Key   string `json:"key" gorm:"uniqueIndex"`
	Value string `json:"value"`
}
