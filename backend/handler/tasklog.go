package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

type CompleteTaskReq struct {
	TaskID uint   `json:"task_id"`
	Note   string `json:"note"`
}

func CompleteTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CompleteTaskReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var task model.Task
		if err := db.First(&task, req.TaskID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}

		log := model.TaskLog{
			TaskID:      req.TaskID,
			CompletedAt: time.Now(),
			Note:        req.Note,
		}
		db.Create(&log)
		updateUserStats(db, task.ExpReward)

		c.JSON(http.StatusOK, log)
	}
}

// UndoTask 取消今天的完成记录并退还 EXP
func UndoTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID, _ := strconv.Atoi(c.Param("taskId"))
		today := time.Now().Format("2006-01-02")

		var log model.TaskLog
		if err := db.Where("task_id = ? AND date(completed_at) = ?", taskID, today).
			Order("completed_at desc").First(&log).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "no completion found today"})
			return
		}

		var task model.Task
		db.First(&task, taskID)

		db.Delete(&log)

		// 退还积分
		var stats model.UserStats
		db.First(&stats)
		stats.TotalExp -= task.ExpReward
		stats.SpendableExp -= task.ExpReward
		if stats.TotalExp < 0 {
			stats.TotalExp = 0
		}
		if stats.SpendableExp < 0 {
			stats.SpendableExp = 0
		}
		stats.Level = calcLevel(stats.TotalExp)
		db.Save(&stats)

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func GetTaskLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Query("task_id")
		var logs []model.TaskLog
		db.Where("task_id = ?", taskID).Order("completed_at desc").Find(&logs)
		c.JSON(http.StatusOK, logs)
	}
}

func updateUserStats(db *gorm.DB, expGained float64) {
	var stats model.UserStats
	db.First(&stats)

	stats.TotalExp += expGained
	stats.SpendableExp += expGained

	today := time.Now().Format("2006-01-02")
	if stats.LastActiveDate != today {
		yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
		if stats.LastActiveDate == yesterday {
			stats.CurrentStreak++
		} else {
			stats.CurrentStreak = 1
		}
		if stats.CurrentStreak > stats.LongestStreak {
			stats.LongestStreak = stats.CurrentStreak
		}
		stats.LastActiveDate = today
	}

	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)
}

func calcLevel(exp float64) int {
	level := 1
	required := 100.0
	for exp >= required {
		exp -= required
		level++
		required = required * 1.3
	}
	return level
}
