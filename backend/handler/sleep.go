package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// 固定起床时间 08:40
const defaultWakeTime = "08:40"

// 惩罚阈值：01:30（即超过这个时间入睡则扣分）
const penaltyThresholdHour = 1
const penaltyThresholdMin = 30

type CreateSleepLogReq struct {
	Date      string `json:"date"`       // YYYY-MM-DD，不填则用今天
	SleepTime string `json:"sleep_time"` // HH:MM，必填
}

// CreateSleepLog 创建睡眠记录，并自动计算时长 + 触发惩罚
func CreateSleepLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateSleepLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.SleepTime == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "sleep_time is required"})
			return
		}

		// 日期默认今天
		date := req.Date
		if date == "" {
			date = time.Now().In(cst).Format("2006-01-02")
		}

		// 检查当天是否已有记录
		var existing model.SleepLog
		if err := db.Where("date = ?", date).First(&existing).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该日期已有睡眠记录，请使用编辑功能"})
			return
		}

		duration, err := calcSleepDuration(date, req.SleepTime, defaultWakeTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("时间格式错误: %v", err)})
			return
		}

		log := model.SleepLog{
			Date:      date,
			SleepTime: req.SleepTime,
			WakeTime:  defaultWakeTime,
			Duration:  duration,
		}

		// 检查是否触发惩罚标记（不在此处扣分，每次完成任务时实时扣）
		log.Penalized = isSleepPenalized(req.SleepTime)
		log.PenaltyExp = 0

		db.Create(&log)
		c.JSON(http.StatusOK, log)
	}
}

// GetSleepLogs 获取睡眠记录列表
func GetSleepLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")

		query := db.Order("date desc")
		if startDate != "" {
			query = query.Where("date >= ?", startDate)
		}
		if endDate != "" {
			query = query.Where("date <= ?", endDate)
		}

		var logs []model.SleepLog
		query.Find(&logs)
		c.JSON(http.StatusOK, logs)
	}
}

// UpdateSleepLog 编辑睡眠记录（重新计算时长和惩罚）
func UpdateSleepLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var log model.SleepLog
		if err := db.First(&log, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}

		var req CreateSleepLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		sleepTime := req.SleepTime
		if sleepTime == "" {
			sleepTime = log.SleepTime
		}

		duration, err := calcSleepDuration(log.Date, sleepTime, defaultWakeTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("时间格式错误: %v", err)})
			return
		}

		// 重新检查惩罚标记（不退还/不扣分，任务完成时实时处理）
		log.SleepTime = sleepTime
		log.WakeTime = defaultWakeTime
		log.Duration = duration
		log.Penalized = isSleepPenalized(sleepTime)
		log.PenaltyExp = 0
		db.Save(&log)

		c.JSON(http.StatusOK, log)
	}
}

// DeleteSleepLog 删除睡眠记录（退还惩罚积分）
func DeleteSleepLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var log model.SleepLog
		if err := db.First(&log, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}

		db.Delete(&log)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// calcSleepDuration 计算睡眠时长（小时）
// 入睡时间可能是深夜（23:xx 或次日 00:xx ~ 03:xx）
func calcSleepDuration(date, sleepTimeStr, wakeTimeStr string) (float64, error) {
	// 解析起床时间（当天日期 + wake time）
	wakeStr := date + " " + wakeTimeStr
	wakeT, err := time.ParseInLocation("2006-01-02 15:04", wakeStr, cst)
	if err != nil {
		return 0, err
	}

	// 解析入睡时间
	sleepStr := date + " " + sleepTimeStr
	sleepT, err := time.ParseInLocation("2006-01-02 15:04", sleepStr, cst)
	if err != nil {
		return 0, err
	}

	// 若入睡时间 >= 起床时间，说明是"前一天"的入睡（如 23:00 入睡 08:40 起床）
	// 此时入睡时间应在前一天
	if sleepT.After(wakeT) || sleepT.Equal(wakeT) {
		sleepT = sleepT.Add(-24 * time.Hour)
	}

	duration := wakeT.Sub(sleepT).Hours()
	if duration < 0 {
		duration = 0
	}
	return duration, nil
}

// isSleepPenalized 判断入睡时间是否超过 01:30（凌晨惩罚区间 00:00~05:59）
// 只返回布尔值；实际扣分在每次任务完成时实时执行
func isSleepPenalized(sleepTimeStr string) bool {
	var h, m int
	fmt.Sscanf(sleepTimeStr, "%d:%d", &h, &m)
	isLateNight := h >= 0 && h < 6
	return isLateNight && (h > penaltyThresholdHour || (h == penaltyThresholdHour && m > penaltyThresholdMin))
}

// TodaySleepPenalty 供外部查询今天是否有晚睡惩罚标记
func TodaySleepPenalty(db *gorm.DB) bool {
	todayCST := time.Now().In(cst).Format("2006-01-02")
	var sl model.SleepLog
	return db.Where("date = ? AND penalized = ?", todayCST, true).First(&sl).Error == nil
}
