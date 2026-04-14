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

		// 检查是否触发惩罚：入睡时间 > 01:30
		penalized, penaltyExp := checkAndApplyPenalty(db, req.SleepTime)
		log.Penalized = penalized
		log.PenaltyExp = penaltyExp

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

		// 如果之前有惩罚，先退还
		if log.Penalized && log.PenaltyExp > 0 {
			var stats model.UserStats
			db.First(&stats)
			stats.SpendableExp += log.PenaltyExp
			stats.TotalExp += log.PenaltyExp
			stats.Level = calcLevel(stats.TotalExp)
			db.Save(&stats)
		}

		// 重新检查惩罚
		penalized, penaltyExp := checkAndApplyPenalty(db, sleepTime)

		log.SleepTime = sleepTime
		log.WakeTime = defaultWakeTime
		log.Duration = duration
		log.Penalized = penalized
		log.PenaltyExp = penaltyExp
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

		// 退还惩罚积分
		if log.Penalized && log.PenaltyExp > 0 {
			var stats model.UserStats
			db.First(&stats)
			stats.SpendableExp += log.PenaltyExp
			stats.TotalExp += log.PenaltyExp
			stats.Level = calcLevel(stats.TotalExp)
			db.Save(&stats)
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

// checkAndApplyPenalty 检查是否超过 01:30 入睡，超过则扣今日积分 20%
func checkAndApplyPenalty(db *gorm.DB, sleepTimeStr string) (bool, float64) {
	// 解析 HH:MM
	var h, m int
	fmt.Sscanf(sleepTimeStr, "%d:%d", &h, &m)

	// 判断是否超过阈值（01:30）
	// 深夜区间：00:00 ~ 05:00 都算"过晚"（凌晨）
	// 晚上区间：22:00 ~ 23:59 不算惩罚（算正常早睡）
	// 惩罚区间：00:00 ~ 05:00 中 > 01:30 的部分
	isLateNight := h >= 0 && h < 6 // 00:00 ~ 05:59 算凌晨
	overThreshold := isLateNight && (h > penaltyThresholdHour || (h == penaltyThresholdHour && m > penaltyThresholdMin))

	if !overThreshold {
		return false, 0
	}

	// 计算今日已获积分（今天 CST 范围内的 task log 积分之和）
	todayStart, todayEnd := todayRangeUTC()
	type result struct {
		Total float64
	}
	var r result
	db.Model(&model.TaskLog{}).
		Select("COALESCE(SUM(exp_awarded), 0) as total").
		Where("completed_at >= ? AND completed_at < ?", todayStart, todayEnd).
		Scan(&r)

	todayExp := r.Total
	if todayExp <= 0 {
		return true, 0 // 惩罚触发但今日无积分可扣
	}

	penalty := todayExp * 0.2

	var stats model.UserStats
	db.First(&stats)
	stats.SpendableExp -= penalty
	stats.TotalExp -= penalty
	if stats.SpendableExp < 0 {
		stats.SpendableExp = 0
	}
	if stats.TotalExp < 0 {
		stats.TotalExp = 0
	}
	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)

	return true, penalty
}
