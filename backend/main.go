package main

import (
	"log"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"selftend/handler"
	"selftend/model"
)

func main() {
	db, err := gorm.Open(sqlite.Open("data.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database:", err)
	}
	db.AutoMigrate(&model.Season{}, &model.Task{}, &model.TaskLog{}, &model.UserStats{}, &model.Prize{})

	autoSeed(db)

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"}, // 生产环境由 Nginx 控制，这里放开方便调试
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowHeaders: []string{"Content-Type"},
	}))

	api := r.Group("/api")
	{
		api.GET("/seasons", handler.GetSeasons(db))
		api.POST("/seasons", handler.CreateSeason(db))
		api.GET("/seasons/:id", handler.GetSeason(db))
		api.PUT("/seasons/:id", handler.UpdateSeason(db))
		api.GET("/seasons/:id/tasks", handler.GetTasks(db))

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
	}

	log.Println("Server running on :8080")
	r.Run(":8080")
}

// autoSeed 首次启动时自动写入初始任务和奖品，已有数据则跳过
func autoSeed(db *gorm.DB) {
	var seasonCount int64
	db.Model(&model.Season{}).Count(&seasonCount)
	if seasonCount > 0 {
		return
	}

	log.Println("Auto-seeding initial data...")

	// 初始赛季
	now := time.Now()
	season := model.Season{
		Name:      "第一赛季",
		Theme:     "好好照顾自己，每天进步一点点",
		StartDate: now.Format("2006-01-02"),
		EndDate:   now.AddDate(0, 1, 0).Format("2006-01-02"),
	}
	db.Create(&season)

	// 所有任务
	tasks := []model.Task{
		// ── 健康 / 每日 ────────────────────────────────
		{SeasonID: season.ID, Title: "洗脸（早晚各一次）", Description: "早上晚上各洗一次脸", Category: "health", Type: "daily", Difficulty: "easy", ExpReward: 1, SortOrder: 1},
		{SeasonID: season.ID, Title: "洗脸（仅晚上）", Description: "只洗了晚上的脸", Category: "health", Type: "daily", Difficulty: "easy", ExpReward: 0.5, SortOrder: 2},
		{SeasonID: season.ID, Title: "刷牙（早晚各一次）", Description: "早上晚上各刷一次牙", Category: "health", Type: "daily", Difficulty: "easy", ExpReward: 1, SortOrder: 3},
		{SeasonID: season.ID, Title: "刷牙（仅晚上）", Description: "只刷了晚上的牙", Category: "health", Type: "daily", Difficulty: "easy", ExpReward: 0.5, SortOrder: 4},
		{SeasonID: season.ID, Title: "涂保湿", Description: "涂抹保湿乳/霜", Category: "health", Type: "daily", Difficulty: "easy", ExpReward: 1, SortOrder: 5},
		{SeasonID: season.ID, Title: "洗澡/洗头（≤2天1次）", Description: "没超过2天洗一次，好习惯", Category: "health", Type: "daily", Difficulty: "normal", ExpReward: 1.5, SortOrder: 6},
		{SeasonID: season.ID, Title: "洗澡/洗头（>2天）", Description: "虽然超时了但还是洗了", Category: "health", Type: "daily", Difficulty: "easy", ExpReward: 1, SortOrder: 7},
		{SeasonID: season.ID, Title: "睡够8小时", Description: "完整睡够8小时", Category: "health", Type: "daily", Difficulty: "hard", ExpReward: 50, SortOrder: 8},
		{SeasonID: season.ID, Title: "睡够7小时", Description: "至少保证7小时睡眠", Category: "health", Type: "daily", Difficulty: "hard", ExpReward: 10, SortOrder: 9},
		// ── 生活 / 每日 ────────────────────────────────
		{SeasonID: season.ID, Title: "擦碎屑", Description: "清理桌面/衣物/身上碎屑", Category: "life", Type: "daily", Difficulty: "easy", ExpReward: 1, SortOrder: 10},
		// ── 情绪 / 每日 ────────────────────────────────
		{SeasonID: season.ID, Title: "素颜出门", Description: "不化妆，自然出行", Category: "mood", Type: "daily", Difficulty: "easy", ExpReward: 1, SortOrder: 11},
		{SeasonID: season.ID, Title: "夹头发", Description: "整理发型，用发夹固定", Category: "mood", Type: "daily", Difficulty: "normal", ExpReward: 2, SortOrder: 12},
		{SeasonID: season.ID, Title: "戴隐形眼镜", Description: "戴上隐形眼镜出门", Category: "mood", Type: "daily", Difficulty: "normal", ExpReward: 2, SortOrder: 13},
		// ── 健康 / 每周 ────────────────────────────────
		{SeasonID: season.ID, Title: "剪指甲", Description: "修剪手指甲或脚指甲", Category: "health", Type: "weekly", Difficulty: "easy", ExpReward: 1, SortOrder: 14},
		// ── 健康 / 赛季 ────────────────────────────────
		{SeasonID: season.ID, Title: "剪头发", Description: "去理发或自行修剪", Category: "health", Type: "season", Difficulty: "normal", ExpReward: 5, SortOrder: 15},
	}
	for i := range tasks {
		db.Create(&tasks[i])
	}

	// 奖品（积分 = 价格/元）
	prizes := []model.Prize{
		{Name: "高驰 Pace 3", Description: "GPS专业运动手表", Category: "watch", Cost: 850},
		{Name: "佳明 Forerunner 255", Description: "GPS专业运动手表", Category: "watch", Cost: 800},
		{Name: "大疆 Action 4", Description: "防抖运动相机", Category: "camera", Cost: 1280},
		{Name: "Redmi K80 Pro 512G", Description: "高性能旗舰手机", Category: "phone", Cost: 1800},
		{Name: "vivo X100 512G", Description: "旗舰影像手机", Category: "phone", Cost: 2000},
		{Name: "索尼 ZV-E10", Description: "入门微单相机，适合vlog", Category: "camera", Cost: 4000},
		{Name: "尼康 Z30", Description: "入门微单相机，无取景器轻量设计", Category: "camera", Cost: 4000},
	}
	for i := range prizes {
		db.Create(&prizes[i])
	}

	// 初始用户数据
	db.Create(&model.UserStats{Level: 1})

	log.Println("Seed complete: 1 season, 15 tasks, 7 prizes")
}
