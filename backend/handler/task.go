package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// cst 全局只加载一次
var cst = mustLoadLocation("Asia/Shanghai")

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		// 容器里没有 tzdata 时的保底：直接用固定偏移
		loc = time.FixedZone("CST", 8*60*60)
	}
	return loc
}

// todayRangeUTC 返回"今天 CST"对应的 UTC 区间 [start, end)
func todayRangeUTC() (start, end time.Time) {
	now := time.Now().In(cst)
	start = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, cst).UTC()
	end = start.Add(24 * time.Hour)
	return
}

// weekRangeUTC 返回"本周一 CST 00:00"对应的 UTC 时间
func weekStartUTC() time.Time {
	now := time.Now().In(cst)
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	monday := time.Date(now.Year(), now.Month(), now.Day()-(weekday-1), 0, 0, 0, 0, cst)
	return monday.UTC()
}

// TaskWithStatus 在 Task 基础上附加完成状态
type TaskWithStatus struct {
	model.Task
	CompletedToday    bool `json:"completed_today"`
	CompletedThisWeek bool `json:"completed_this_week"`
	CompletedInSeason bool `json:"completed_in_season"`
}

func GetTasks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seasonID, _ := strconv.Atoi(c.Param("id"))
		taskType := c.Query("type")

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

		// 计算时间区间（CST 基准，转 UTC 存储对齐）
		todayStart, todayEnd := todayRangeUTC()
		weekStart := weekStartUTC()
		seasonStart := season.StartDate // "YYYY-MM-DD"（CST日期字符串）

		result := make([]TaskWithStatus, len(tasks))
		for i, t := range tasks {
			var todayCount, weekCount, seasonCount int64

			db.Model(&model.TaskLog{}).
				Where("task_id = ? AND completed_at >= ? AND completed_at < ?",
					t.ID, todayStart, todayEnd).
				Count(&todayCount)

			db.Model(&model.TaskLog{}).
				Where("task_id = ? AND completed_at >= ?", t.ID, weekStart).
				Count(&weekCount)

			// 赛季任务：从赛季开始日 CST 00:00 起算
			seasonStartTime, _ := time.ParseInLocation("2006-01-02", seasonStart, cst)
			db.Model(&model.TaskLog{}).
				Where("task_id = ? AND completed_at >= ?", t.ID, seasonStartTime.UTC()).
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
