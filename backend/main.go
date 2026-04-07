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

// initUserStats 确保 UserStats 记录存在（系统唯一记录，不是业务数据）
func initUserStats(db *gorm.DB) {
	var count int64
	db.Model(&model.UserStats{}).Count(&count)
	if count == 0 {
		db.Create(&model.UserStats{Level: 1})
	}
}
