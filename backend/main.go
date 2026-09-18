package main

import (
	"encoding/json"
	"log"
	"math"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"selftend/handler"
	"selftend/middleware"
	"selftend/model"
)

func main() {
	// 本地开发自动加载 .env，生产环境文件不存在时静默跳过
	_ = godotenv.Load()

	db, err := gorm.Open(sqlite.Open("data.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database:", err)
	}
	db.AutoMigrate(
		&model.Season{},
		&model.Task{},
		&model.TaskLog{},
		&model.UserStats{},
		&model.Prize{},
		&model.RedemptionLog{},
		&model.SleepLog{},
		&model.EnergyLog{},
		&model.ReviewLog{},
		&model.UserConfig{},
		&model.WorryNote{},
		&model.Wish{},
	)

	// 仅初始化 UserStats（业务必须存在的系统记录）
	initUserStats(db)

	// 一次性迁移：把老的 timing='both' 任务自动转成 variants 配置
	migrateTimingBothToVariants(db)

	// 一次性迁移：能量刻度从 1-5 改为对齐 Garmin 的 1-4，把越界的旧 5 分降到 4
	migrateEnergyLevelTo4Tier(db)

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowHeaders: []string{"Content-Type", "X-Access-Code"},
	}))

	// 公开：验证访问码
	r.POST("/api/auth/login", middleware.CheckCode())

	// 外部自动导入（iOS HealthKit / Garmin 定时同步）：独立 X-Import-Secret 鉴权，不走主 access code
	r.POST("/api/sleep-logs/import", middleware.ImportSecret(), handler.ImportSleepLog(db))
	r.POST("/api/energy-logs/import", middleware.ImportSecret(), handler.ImportEnergyLog(db))
	// 供同步脚本查「最近哪几天缺记录」，用于自动补漏
	r.GET("/api/sync-status", middleware.ImportSecret(), handler.SyncStatus(db))

	// 受保护路由
	api := r.Group("/api", middleware.AccessCode())
	{
		api.GET("/seasons", handler.GetSeasons(db))
		api.POST("/seasons", handler.CreateSeason(db))
		api.GET("/seasons/:id", handler.GetSeason(db))
		api.PUT("/seasons/:id", handler.UpdateSeason(db))
		api.GET("/seasons/:id/tasks", handler.GetTasks(db))
		api.GET("/seasons/:id/incomplete-tasks", handler.GetIncompleteSeasonTasks(db))
		api.POST("/seasons/:id/inherit-tasks", handler.InheritTasks(db))

		api.POST("/tasks", handler.CreateTask(db))
		api.PUT("/tasks/:id", handler.UpdateTask(db))
		api.DELETE("/tasks/:id", handler.DeleteTask(db))

		api.POST("/task-logs", handler.CompleteTask(db))
		api.GET("/task-logs", handler.GetTaskLogs(db))
		api.DELETE("/task-logs/undo/:taskId", handler.UndoTask(db))

		api.GET("/stats", handler.GetStats(db))

		api.GET("/prizes", handler.GetPrizes(db))
		api.POST("/prizes", handler.CreatePrize(db))
		api.PUT("/prizes/:id", handler.UpdatePrize(db))
		api.DELETE("/prizes/:id", handler.DeletePrize(db))
		api.POST("/prizes/:id/redeem", handler.RedeemPrize(db))
		api.GET("/redemptions", handler.GetRedemptions(db))
		api.POST("/redemptions/backfill", handler.BackfillRedemptions(db))

		// 睡眠记录
		api.POST("/sleep-logs", handler.CreateSleepLog(db))
		api.GET("/sleep-logs", handler.GetSleepLogs(db))
		api.PUT("/sleep-logs/:id", handler.UpdateSleepLog(db))
		api.DELETE("/sleep-logs/:id", handler.DeleteSleepLog(db))
		api.POST("/sleep-logs/backfill-penalty", handler.BackfillPenaltyExp(db))

		// 能量记录
		api.POST("/energy-logs", handler.CreateEnergyLog(db))
		api.GET("/energy-logs", handler.GetEnergyLogs(db))
		api.PUT("/energy-logs/:id", handler.UpdateEnergyLog(db))
		api.DELETE("/energy-logs/:id", handler.DeleteEnergyLog(db))

		// 数据分析（睡眠 + 能量聚合）
		api.GET("/analytics", handler.GetAnalytics(db))

		// AI Agent（工具调用：读自动执行 / 写提议待确认）
		api.POST("/agent/chat", handler.AgentChat(db))

		// 每日复盘
		api.POST("/review/chat", handler.Chat(db))
		api.POST("/review/save", handler.SaveReview(db))
		api.GET("/review/logs", handler.GetReviews(db))

		// 焦虑暂存箱
		api.POST("/worries", handler.CreateWorryNote(db))
		api.GET("/worries", handler.GetWorryNotes(db))
		api.PUT("/worries/:id", handler.UpdateWorryNote(db))
		api.POST("/worries/:id/resolve", handler.ResolveWorryNote(db))
		api.DELETE("/worries/:id", handler.DeleteWorryNote(db))

		// 心愿（特殊礼物 · 优先注入）
		api.POST("/wishes", handler.CreateWish(db))
		api.GET("/wishes", handler.GetWishes(db))
		api.DELETE("/wishes/:id", handler.DeleteWish(db))

		// 通用用户配置（key-value，如睡前倒计时锚点）
		api.GET("/config/:key", handler.GetUserConfig(db))
		api.PUT("/config/:key", handler.SetUserConfig(db))
	}

	log.Println("Server running on :8080")
	r.Run(":8080")
}

// initUserStats 确保 UserStats 记录存在（系统唯一记录，不是业务数据）
func initUserStats(db *gorm.DB) {
	var count int64
	db.Model(&model.UserStats{}).Count(&count)
	if count == 0 {
		db.Create(&model.UserStats{Level: 1})
	}
}

// migrateTimingBothToVariants 把老的 timing='both' 任务自动生成对应的 variants 配置
// 只在 timing 列还存在且 variants 为空时执行。执行后把 timing 列丢掉。
func migrateTimingBothToVariants(db *gorm.DB) {
	migrator := db.Migrator()
	// 表里没有 timing 列就跳过（已经迁移过了）
	if !migrator.HasColumn(&model.Task{}, "timing") {
		return
	}

	type legacyTask struct {
		ID        uint
		Timing    string
		ExpReward float64
		Variants  string
	}
	var rows []legacyTask
	db.Table("tasks").Select("id, timing, exp_reward, variants").Scan(&rows)

	for _, r := range rows {
		// 已经有 variants 就不动
		if r.Variants != "" && r.Variants != "[]" {
			continue
		}
		if r.Timing != "both" {
			continue
		}
		// 早晚都做拿全分，单做一半。保留一位小数。
		half := math.Round(r.ExpReward/2*10) / 10
		variants := []map[string]any{
			{"label": "早上", "icon": "🌅", "exp": half},
			{"label": "晚上", "icon": "🌙", "exp": half},
			{"label": "早晚都做", "icon": "☀️", "exp": r.ExpReward},
		}
		buf, _ := json.Marshal(variants)
		db.Table("tasks").Where("id = ?", r.ID).Update("variants", string(buf))
		log.Printf("[migrate] task#%d timing=both → variants %s", r.ID, buf)
	}

	// 丢掉 timing 列
	if err := migrator.DropColumn(&model.Task{}, "timing"); err != nil {
		log.Printf("[migrate] drop timing column failed (可忽略): %v", err)
	} else {
		log.Println("[migrate] dropped task.timing column")
	}
}

// migrateEnergyLevelTo4Tier 一次性迁移：能量刻度 1-5 → 1-4（对齐 Garmin 原生四档）。
//
// 旧刻度 5=满血 在新刻度里越界（新上限是 4=EXCELLENT 优秀），不迁移的话
// 这些历史记录在前端编辑时会被 1-4 校验拒绝。这里只把 5 降到 4，
// 其余 1-4 的旧值保持原样不动——那些是用户当初的主观自评，
// 语义虽与新分级有偏移，但都是合法值，不擅自改写。
//
// 幂等：迁移后库里不再有 5，重复启动不会重复处理。
func migrateEnergyLevelTo4Tier(db *gorm.DB) {
	var count int64
	db.Model(&model.EnergyLog{}).Where("energy_level > 4").Count(&count)
	if count == 0 {
		return
	}
	db.Model(&model.EnergyLog{}).Where("energy_level > 4").Update("energy_level", 4)
	log.Printf("已迁移 %d 条能量记录：旧 5 分（满血）→ 4 分（优秀），对齐 Garmin 四档", count)
}
