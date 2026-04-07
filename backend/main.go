package main

import (
	"log"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"selftend/handler"
	"selftend/middleware"
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
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowHeaders: []string{"Content-Type", "X-Access-Code"},
	}))

	// 公开路由：验证访问码
	r.POST("/api/auth/login", middleware.CheckCode())

	// 受保护路由
	api := r.Group("/api", middleware.AccessCode())
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

func autoSeed(db *gorm.DB) {
	var seasonCount int64
	db.Model(&model.Season{}).Count(&seasonCount)
	if seasonCount > 0 {
		return
	}

	log.Println("Auto-seeding initial data...")

	now := time.Now()
	season := model.Season{
		Name:      "第一赛季",
		Theme:     "好好照顾自己，每天进步一点点",
		StartDate: now.Format("2006-01-02"),
		EndDate:   now.AddDate(0, 1, 0).Format("2006-01-02"),
	}
	db.Create(&season)

	tasks := []model.Task{
		// 健康 / 每日
		{SeasonID: season.ID, Title: "洗脸", Description: "早晚各一次", Category: "health", Type: "daily", Timing: "both", Difficulty: "easy", ExpReward: 1, SortOrder: 1},
		{SeasonID: season.ID, Title: "洗脸", Description: "仅晚上", Category: "health", Type: "daily", Timing: "evening", Difficulty: "easy", ExpReward: 0.5, SortOrder: 2},
		{SeasonID: season.ID, Title: "刷牙", Description: "早晚各一次", Category: "health", Type: "daily", Timing: "both", Difficulty: "easy", ExpReward: 1, SortOrder: 3},
		{SeasonID: season.ID, Title: "刷牙", Description: "仅晚上", Category: "health", Type: "daily", Timing: "evening", Difficulty: "easy", ExpReward: 0.5, SortOrder: 4},
		{SeasonID: season.ID, Title: "涂保湿", Description: "", Category: "health", Type: "daily", Timing: "morning", Difficulty: "easy", ExpReward: 1, SortOrder: 5},
		{SeasonID: season.ID, Title: "洗澡/洗头", Description: "≤2天1次", Category: "health", Type: "daily", Timing: "anytime", Difficulty: "normal", ExpReward: 1.5, SortOrder: 6},
		{SeasonID: season.ID, Title: "洗澡/洗头", Description: "超过2天才洗", Category: "health", Type: "daily", Timing: "anytime", Difficulty: "easy", ExpReward: 1, SortOrder: 7},
		{SeasonID: season.ID, Title: "睡够8小时", Description: "", Category: "health", Type: "daily", Timing: "evening", Difficulty: "hard", ExpReward: 50, SortOrder: 8},
		{SeasonID: season.ID, Title: "睡够7小时", Description: "", Category: "health", Type: "daily", Timing: "evening", Difficulty: "hard", ExpReward: 10, SortOrder: 9},
		// 生活 / 每日
		{SeasonID: season.ID, Title: "擦碎屑", Description: "", Category: "life", Type: "daily", Timing: "anytime", Difficulty: "easy", ExpReward: 1, SortOrder: 10},
		// 情绪 / 每日
		{SeasonID: season.ID, Title: "素颜出门", Description: "", Category: "mood", Type: "daily", Timing: "out", Difficulty: "easy", ExpReward: 1, SortOrder: 11},
		{SeasonID: season.ID, Title: "夹头发", Description: "", Category: "mood", Type: "daily", Timing: "out", Difficulty: "normal", ExpReward: 2, SortOrder: 12},
		{SeasonID: season.ID, Title: "戴隐形眼镜", Description: "", Category: "mood", Type: "daily", Timing: "out", Difficulty: "normal", ExpReward: 2, SortOrder: 13},
		// 健康 / 每周
		{SeasonID: season.ID, Title: "剪指甲", Description: "", Category: "health", Type: "weekly", Timing: "anytime", Difficulty: "easy", ExpReward: 1, SortOrder: 14},
		// 健康 / 赛季
		{SeasonID: season.ID, Title: "剪头发", Description: "", Category: "health", Type: "season", Timing: "anytime", Difficulty: "normal", ExpReward: 5, SortOrder: 15},
	}
	for i := range tasks {
		db.Create(&tasks[i])
	}

	prizes := []model.Prize{
		{Name: "高驰 Pace 3", Description: "GPS专业运动手表", Category: "watch", Cost: 850},
		{Name: "佳明 Forerunner 255", Description: "GPS专业运动手表", Category: "watch", Cost: 800},
		{Name: "大疆 Action 4", Description: "防抖运动相机", Category: "camera", Cost: 1280},
		{Name: "Redmi K80 Pro 512G", Description: "高性能旗舰手机", Category: "phone", Cost: 1800},
		{Name: "vivo X100 512G", Description: "旗舰影像手机", Category: "phone", Cost: 2000},
		{Name: "索尼 ZV-E10", Description: "入门微单相机", Category: "camera", Cost: 4000},
		{Name: "尼康 Z30", Description: "入门微单相机", Category: "camera", Cost: 4000},
	}
	for i := range prizes {
		db.Create(&prizes[i])
	}

	db.Create(&model.UserStats{Level: 1})
	log.Println("Seed complete")
}
