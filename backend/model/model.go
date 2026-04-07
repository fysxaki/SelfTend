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
	Difficulty  string  `json:"difficulty"` // easy / normal / hard
	ExpReward   float64 `json:"exp_reward"`
	SortOrder   int     `json:"sort_order"`
}

type TaskLog struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	TaskID      uint      `json:"task_id"`
	CompletedAt time.Time `json:"completed_at"`
	Note        string    `json:"note"`
}

type UserStats struct {
	ID             uint    `json:"id" gorm:"primaryKey"`
	TotalExp       float64 `json:"total_exp"`     // 累计经验，只增不减，用于等级
	SpendableExp   float64 `json:"spendable_exp"` // 可消费积分，兑换奖品后扣除
	Level          int     `json:"level"`
	CurrentStreak  int     `json:"current_streak"`
	LongestStreak  int     `json:"longest_streak"`
	LastActiveDate string  `json:"last_active_date"` // YYYY-MM-DD
}

type Prize struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Category    string     `json:"category"` // camera / watch / phone / other
	Cost        float64    `json:"cost"`     // 积分成本 = 商品价格(元)
	Redeemed    bool       `json:"redeemed"`
	RedeemedAt  *time.Time `json:"redeemed_at"`
}
