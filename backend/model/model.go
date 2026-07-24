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
	Category    string  `json:"category"`   // health / work / life / mood
	Type        string  `json:"type"`       // daily / weekly / season / once
	Difficulty  string  `json:"difficulty"` // easy / normal / hard
	ExpReward   float64 `json:"exp_reward"`
	SortOrder   int     `json:"sort_order"`
	// Variants 完成方式可选配置（JSON 字符串）。
	// 格式：[{"label":"早上","icon":"🌅","exp":0.5}, ...]
	// 留空或 [] 表示单击直接完成；非空则点击时弹窗选择。
	Variants string `json:"variants" gorm:"type:text;default:''"`
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
	// Source 记录来源：空 / "manual"=手动录入；"healthkit"=iOS 健康自动导入；
	// 手动记录优先级更高，自动导入不会覆盖
	Source    string    `json:"source" gorm:"default:'manual'"`
	CreatedAt time.Time `json:"created_at"`
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

// Wish 心愿：独立于普通奖励商店的「特殊礼物」。B 模式——先用真钱买下，
// 之后新增积分 100% 优先注入，把「我纵容了自己」挣成「我应得的」。
// 同时只允许 1 个进行中，单笔价格有上限（护栏，防冲动）。
type Wish struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	Title       string     `json:"title"`        // 心愿名称
	Reason      string     `json:"reason"`       // 为什么想要（给自己的一句话）
	PriceYuan   float64    `json:"price_yuan"`   // 实际花的钱
	TargetExp   float64    `json:"target_exp"`   // 要挣回的积分目标
	EarnedExp   float64    `json:"earned_exp"`   // 已挣回的积分
	Status      string     `json:"status"`       // active（挣回中）/ done（已还清）
	PurchasedAt time.Time  `json:"purchased_at"` // 买下的时间
	DoneAt      *time.Time `json:"done_at"`      // 还清时间
	CreatedAt   time.Time  `json:"created_at"`
}

// WorryNote 焦虑暂存箱：深夜焦虑念头先记下，标一个「处理时间」，
// 到时间再由清醒的自己处理，拦截「凌晨疯狂搜攻略」的死循环。
type WorryNote struct {
	ID         uint       `json:"id" gorm:"primaryKey"`
	Content    string     `json:"content"`                      // 焦虑的念头
	HandleDate string     `json:"handle_date"`                  // YYYY-MM-DD，计划处理这件事的日期
	Resolved   bool       `json:"resolved"`                     // 是否已处理
	ResolvedAt *time.Time `json:"resolved_at"`                  // 处理时间
	CreatedAt  time.Time  `json:"created_at"`                   // 记下的时间
}
