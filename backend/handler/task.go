package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// TaskWithStatus 在 Task 基础上附加完成状态
type TaskWithStatus struct {
	model.Task
	CompletedToday    bool `json:"completed_today"`
	CompletedThisWeek bool `json:"completed_this_week"`
	CompletedInSeason bool `json:"completed_in_season"`
}

// GetTasks 获取某赛季的任务，可按 type 过滤，附带完成状态
func GetTasks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seasonID, _ := strconv.Atoi(c.Param("id"))
		taskType := c.Query("type")

		// 取赛季信息（用于判断赛季任务完成状态）
		var season model.Season
		if err := db.First(&season, seasonID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "season not found"})
			return
		}

		query := db.Where("season_id = ?", seasonID)
		if taskType != "" {
			query = query.Where("type = ?", taskType)
		}

		var tasks []model.Task
		query.Order("sort_order asc").Find(&tasks)

		now := time.Now()
		todayStr := now.Format("2006-01-02")

		// 本周一
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		weekStart := now.AddDate(0, 0, -(weekday - 1)).Format("2006-01-02")

		result := make([]TaskWithStatus, len(tasks))
		for i, t := range tasks {
			var todayCount, weekCount, seasonCount int64

			db.Model(&model.TaskLog{}).
				Where("task_id = ? AND date(completed_at) = ?", t.ID, todayStr).
				Count(&todayCount)

			db.Model(&model.TaskLog{}).
				Where("task_id = ? AND date(completed_at) >= ?", t.ID, weekStart).
				Count(&weekCount)

			// 赛季任务：从赛季开始日期起算
			db.Model(&model.TaskLog{}).
				Where("task_id = ? AND date(completed_at) >= ?", t.ID, season.StartDate).
				Count(&seasonCount)

			result[i] = TaskWithStatus{
				Task:              t,
				CompletedToday:    todayCount > 0,
				CompletedThisWeek: weekCount > 0,
				CompletedInSeason: seasonCount > 0,
			}
		}

		c.JSON(http.StatusOK, result)
	}
}

func CreateTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var task model.Task
		if err := c.ShouldBindJSON(&task); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		db.Create(&task)
		c.JSON(http.StatusOK, task)
	}
}

func UpdateTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var task model.Task
		if err := db.First(&task, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err := c.ShouldBindJSON(&task); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		task.ID = uint(id)
		db.Save(&task)
		c.JSON(http.StatusOK, task)
	}
}

func DeleteTask(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		db.Delete(&model.Task{}, id)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
