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
