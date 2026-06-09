package handler

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// 固定起床时间 08:52
const defaultWakeTime = "08:52"

// 惩罚阈值：01:30（即超过这个时间入睡则扣分）
const penaltyThresholdHour = 1
const penaltyThresholdMin = 30

type CreateSleepLogReq struct {
	Date      string `json:"date"`       // YYYY-MM-DD，不填则用今天
	SleepTime string `json:"sleep_time"` // HH:MM，必填
	WakeTime  string `json:"wake_time"`  // HH:MM，不填则用默认值
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

		wakeTime := req.WakeTime
		if wakeTime == "" {
			wakeTime = defaultWakeTime
		}

		duration, err := calcSleepDuration(date, req.SleepTime, wakeTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("时间格式错误: %v", err)})
			return
		}

		log := model.SleepLog{
			Date:      date,
			SleepTime: req.SleepTime,
			WakeTime:  wakeTime,
			Duration:  duration,
		}

		// 晚睡惩罚：补扣该日已完成任务的20%
		log.Penalized = isSleepPenalized(req.SleepTime)
		if log.Penalized {
			log.PenaltyExp = applyRetroactivePenalty(db, date)
		}

		// 时长奖惩：<6h 扣该日任务积分20%，7-8h +12分，>=8h +52分
		log.BonusExp = applyDurationBonus(db, duration, date)

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
		wakeTime := req.WakeTime
		if wakeTime == "" {
			wakeTime = log.WakeTime
		}

		duration, err := calcSleepDuration(log.Date, sleepTime, wakeTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("时间格式错误: %v", err)})
			return
		}

		// 退还旧的晚睡补扣
		if log.Penalized && log.PenaltyExp > 0 {
			refundStats(db, log.PenaltyExp)
		}
		// 退还旧的时长奖惩（正数=曾加分需扣回，负数=曾扣分需补回）
		if log.BonusExp != 0 {
			refundStats(db, log.BonusExp)
		}

		// 重新计算晚睡惩罚
		log.SleepTime = sleepTime
		log.WakeTime = wakeTime
		log.Duration = duration
		log.Penalized = isSleepPenalized(sleepTime)
		log.PenaltyExp = 0
		if log.Penalized {
			log.PenaltyExp = applyRetroactivePenalty(db, log.Date)
		}

		// 重新计算时长奖惩
		log.BonusExp = applyDurationBonus(db, duration, log.Date)

		db.Save(&log)

		c.JSON(http.StatusOK, log)
	}
}

// ImportSleepLogReq iOS 健康（HealthKit）自动同步过来的睡眠记录
type ImportSleepLogReq struct {
	Date      string `json:"date"`       // YYYY-MM-DD（起床那天）
	SleepTime string `json:"sleep_time"` // HH:MM 入睡时间
	WakeTime  string `json:"wake_time"`  // HH:MM 起床时间，可选
}

// ImportSleepLog 来自 iOS HealthKit 的自动同步。
// 行为：
//   - 当天没有记录 → 创建（source=healthkit），并计算奖惩
//   - 当天已有 manual 记录 → 跳过（手动优先）
//   - 当天已有 healthkit 记录 → 更新时间，重算时长/奖惩，并补退之前的奖惩
//
// 鉴权：单独的 X-Import-Secret 头（env 配置 SLEEP_IMPORT_SECRET），与主 access code 分离，
// 方便给 iOS Shortcut 用长期 token。
func ImportSleepLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ImportSleepLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Date == "" || req.SleepTime == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "date 和 sleep_time 必填"})
			return
		}

		wakeTime := req.WakeTime
		if wakeTime == "" {
			wakeTime = defaultWakeTime
		}

		duration, err := calcSleepDuration(req.Date, req.SleepTime, wakeTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("时间格式错误: %v", err)})
			return
		}

		var existing model.SleepLog
		findErr := db.Where("date = ?", req.Date).First(&existing).Error

		// 已存在手动记录 → 不动，告诉调用方跳过
		if findErr == nil && existing.Source != "" && existing.Source != "healthkit" {
			c.JSON(http.StatusOK, gin.H{
				"skipped": true,
				"reason":  "manual record exists, healthkit will not overwrite",
				"log":     existing,
			})
			return
		}

		// 已有 healthkit 记录 → 退还旧奖惩，重新计算，更新时间
		if findErr == nil {
			if existing.Penalized && existing.PenaltyExp > 0 {
				refundStats(db, existing.PenaltyExp)
			}
			if existing.BonusExp != 0 {
				refundStats(db, existing.BonusExp)
			}
			existing.SleepTime = req.SleepTime
			existing.WakeTime = wakeTime
			existing.Duration = duration
			existing.Penalized = isSleepPenalized(req.SleepTime)
			existing.PenaltyExp = 0
			if existing.Penalized {
				existing.PenaltyExp = applyRetroactivePenalty(db, req.Date)
			}
			existing.BonusExp = applyDurationBonus(db, duration, req.Date)
			existing.Source = "healthkit"
			db.Save(&existing)
			c.JSON(http.StatusOK, gin.H{"updated": true, "log": existing})
			return
		}

		// 全新创建
		log := model.SleepLog{
			Date:      req.Date,
			SleepTime: req.SleepTime,
			WakeTime:  wakeTime,
			Duration:  duration,
			Source:    "healthkit",
		}
		log.Penalized = isSleepPenalized(req.SleepTime)
		if log.Penalized {
			log.PenaltyExp = applyRetroactivePenalty(db, req.Date)
		}
		log.BonusExp = applyDurationBonus(db, duration, req.Date)
		db.Create(&log)
		c.JSON(http.StatusOK, gin.H{"created": true, "log": log})
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

		// 退还晚睡补扣
		if log.Penalized && log.PenaltyExp > 0 {
			refundStats(db, log.PenaltyExp)
		}
		// 退还时长奖惩
		if log.BonusExp != 0 {
			refundStats(db, log.BonusExp)
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

// applyRetroactivePenalty 补扣指定日期已完成任务积分的20%，返回扣除金额
func applyRetroactivePenalty(db *gorm.DB, date string) float64 {
	dayStart, err := time.ParseInLocation("2006-01-02", date, cst)
	if err != nil {
		return 0
	}
	dayEnd := dayStart.Add(24 * time.Hour)
	type sumResult struct{ Total float64 }
	var r sumResult
	db.Model(&model.TaskLog{}).
		Select("COALESCE(SUM(exp_awarded), 0) as total").
		Where("completed_at >= ? AND completed_at < ?", dayStart.UTC(), dayEnd.UTC()).
		Scan(&r)
	if r.Total <= 0 {
		return 0
	}
	penalty := r.Total * 0.2
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
	return penalty
}

// BackfillPenaltyExp 回填历史 SleepLog 的 penalty_exp
// 找出所有 penalized=true 且 penalty_exp=0 的记录，按日期查 TaskLog 补算
func BackfillPenaltyExp(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var logs []model.SleepLog
		db.Where("penalized = ? AND penalty_exp = 0", true).Find(&logs)

		if len(logs) == 0 {
			c.JSON(http.StatusOK, gin.H{"message": "没有需要回填的记录", "updated": 0})
			return
		}

		updated := 0
		for _, sl := range logs {
			// 该日期 CST 00:00 ~ 次日 CST 00:00 对应的 UTC 区间
			dayStart, err := time.ParseInLocation("2006-01-02", sl.Date, cst)
			if err != nil {
				continue
			}
			dayEnd := dayStart.Add(24 * time.Hour)

			type sumResult struct{ Total float64 }
			var r sumResult
			db.Model(&model.TaskLog{}).
				Select("COALESCE(SUM(exp_awarded), 0) as total").
				Where("completed_at >= ? AND completed_at < ?", dayStart.UTC(), dayEnd.UTC()).
				Scan(&r)

			if r.Total <= 0 {
				continue
			}

			// 历史任务积分是满额发的（未被实时惩罚），补算 20%
			penalty := r.Total * 0.2
			db.Model(&sl).Update("penalty_exp", penalty)
			updated++
		}

		c.JSON(http.StatusOK, gin.H{"message": "回填完成", "updated": updated})
	}
}

// applyDurationBonus 根据睡眠时长发放奖励或惩罚，返回净变化量（正=加分，负=扣分）
//
// 规则（全程线性平滑，避免阶梯跳跃）：
//   - <6h:    扣该日任务积分 20%
//   - 6-7h:   线性 0 → 12（每多 0.1h 加 1.2 分）
//   - 7-8h:   线性 12 → 52（每多 0.1h 加 4 分）
//   - >=8h:   封顶 52 分
func applyDurationBonus(db *gorm.DB, duration float64, date string) float64 {
	var stats model.UserStats
	db.First(&stats)

	// <6h 惩罚分支
	if duration < 6 {
		dayStart, err := time.ParseInLocation("2006-01-02", date, cst)
		if err != nil {
			return 0
		}
		dayEnd := dayStart.Add(24 * time.Hour)
		type sumResult struct{ Total float64 }
		var r sumResult
		db.Model(&model.TaskLog{}).
			Select("COALESCE(SUM(exp_awarded), 0) as total").
			Where("completed_at >= ? AND completed_at < ?", dayStart.UTC(), dayEnd.UTC()).
			Scan(&r)
		if r.Total <= 0 {
			return 0
		}
		penalty := r.Total * 0.2
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
		return -penalty
	}

	// 6h 以上的奖励：分两段线性插值，8h 封顶
	//   6-7h: 0 → 12  (斜率 12/h)
	//   7-8h: 12 → 52 (斜率 40/h)
	var bonus float64
	switch {
	case duration < 7:
		bonus = (duration - 6) * 12
	case duration <= 8:
		bonus = 12 + (duration-7)*40
	default:
		bonus = 52
	}
	// 保留 1 位小数
	bonus = math.Round(bonus*10) / 10

	stats.SpendableExp += bonus
	stats.TotalExp += bonus
	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)
	return bonus
}

// refundStats 退还积分到 UserStats
func refundStats(db *gorm.DB, amount float64) {
	if amount <= 0 {
		return
	}
	var stats model.UserStats
	db.First(&stats)
	stats.SpendableExp += amount
	stats.TotalExp += amount
	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)
}
