package main

import (
	"log"

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
	db.AutoMigrate(
		&model.Season{},
		&model.Task{},
		&model.TaskLog{},
		&model.UserStats{},
		&model.Prize{},
		&model.SleepLog{},
		&model.EnergyLog{},
		&model.ReviewLog{},
		&model.UserConfig{},
	)

	// 仅初始化 UserStats（业务必须存在的系统记录）
	initUserStats(db)

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowHeaders: []string{"Content-Type", "X-Access-Code"},
	}))

	// 公开：验证访问码
	r.POST("/api/auth/login", middleware.CheckCode())

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

		// 睡眠记录
		api.POST("/sleep-logs", handler.CreateSleepLog(db))
		api.GET("/sleep-logs", handler.GetSleepLogs(db))
		api.PUT("/sleep-logs/:id", handler.UpdateSleepLog(db))
		api.DELETE("/sleep-logs/:id", handler.DeleteSleepLog(db))

		// 能量记录
		api.POST("/energy-logs", handler.CreateEnergyLog(db))
		api.GET("/energy-logs", handler.GetEnergyLogs(db))
		api.PUT("/energy-logs/:id", handler.UpdateEnergyLog(db))
		api.DELETE("/energy-logs/:id", handler.DeleteEnergyLog(db))

		// 数据分析（睡眠 + 能量聚合）
		api.GET("/analytics", handler.GetAnalytics(db))

		// 每日复盘
		api.POST("/review/chat", handler.Chat(db))
		api.POST("/review/save", handler.SaveReview(db))
		api.GET("/review/logs", handler.GetReviews(db))
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
