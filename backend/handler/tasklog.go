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
	TaskID      uint    `json:"task_id"`
	Note        string  `json:"note"`
	ExpOverride float64 `json:"exp_override"`
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

		exp := task.ExpReward
		if req.ExpOverride > 0 {
			exp = req.ExpOverride
		}

		// 实时检查今日晚睡惩罚标记，有则本次积分 ×0.8
		penaltyApplied := TodaySleepPenalty(db)
		if penaltyApplied {
			exp = exp * 0.8
		}

		taskLog := model.TaskLog{
			TaskID:      req.TaskID,
			CompletedAt: time.Now(),
			Note:        req.Note,
			ExpAwarded:  exp,
		}
		db.Create(&taskLog)
		updateUserStats(db, exp)
		c.JSON(http.StatusOK, gin.H{
			"task_log":       taskLog,
			"penalty_applied": penaltyApplied,
		})
	}
}

// UndoTask 取消完成记录并退还积分
// 每日任务：只能撤销今天（CST）的记录
// 每周任务：可撤销本周（CST）内的记录
func UndoTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID, _ := strconv.Atoi(c.Param("taskId"))

		var task model.Task
		if err := db.First(&task, taskID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
			return
		}

		var log model.TaskLog
		var queryErr error

		switch task.Type {
		case "weekly":
			weekStart := weekStartUTC()
			queryErr = db.Where("task_id = ? AND completed_at >= ?", taskID, weekStart).
				Order("completed_at desc").First(&log).Error
		default:
			todayStart, todayEnd := todayRangeUTC()
			queryErr = db.Where("task_id = ? AND completed_at >= ? AND completed_at < ?",
				taskID, todayStart, todayEnd).
				Order("completed_at desc").First(&log).Error
		}

		if queryErr != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "no completion record found"})
			return
		}

		// 退还实际发放的积分（兼容旧记录：ExpAwarded=0 时退 task.ExpReward）
		refund := log.ExpAwarded
		if refund == 0 {
			refund = task.ExpReward
		}

		db.Delete(&log)

		var stats model.UserStats
		db.First(&stats)
		stats.TotalExp -= refund
		stats.SpendableExp -= refund
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

	// 连续打卡：以 CST 日期字符串判断
	todayCST := time.Now().In(cst).Format("2006-01-02")
	yesterdayCST := time.Now().In(cst).Add(-24 * time.Hour).Format("2006-01-02")

	if stats.LastActiveDate != todayCST {
		if stats.LastActiveDate == yesterdayCST {
			stats.CurrentStreak++
		} else {
			stats.CurrentStreak = 1
		}
		if stats.CurrentStreak > stats.LongestStreak {
			stats.LongestStreak = stats.CurrentStreak
		}
		stats.LastActiveDate = todayCST
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
