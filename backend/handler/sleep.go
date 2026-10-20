package handler

import (
	"encoding/json"
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

// 晚睡惩罚：入睡晚于 01:30 时每晚固定扣 lateSleepPenaltyExp 分。
// 以前按「当天任务积分的百分比」扣，当天没做什么任务就几乎扣不到，起不到约束作用；
// 改成固定值后与任务多少无关，也不再对当天后续完成的任务打折。
const lateSleepPenaltyExp = 10.0

// 起床时间稳定奖励：CBT-I 最核心的一条是「固定起床时间，周末也一样」。
// 实际起床与配置的固定起床时间相差不超过 wakeBonusToleranceMin 分钟就发奖励。
const (
	wakeBonusExp          = 10.0
	wakeBonusToleranceMin = 30
	// 固定起床时间存 UserConfig，与前端同 key。key 名带 workday 是历史原因，现在工作日和休息日共用。
	fixedWakeConfigKey = "workday_wake"
	fixedWakeDefault   = "07:35"
)

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

		// 晚睡惩罚：固定扣 lateSleepPenaltyExp 分
		log.Penalized = isSleepPenalized(req.SleepTime)
		if log.Penalized {
			log.PenaltyExp = applyLatePenalty(db)
		}

		// 时长奖惩：<6h 扣该日任务积分20%，6→8h 线性 0~+52，>=8h 封顶
		log.BonusExp = applyDurationBonus(db, duration, rewardableDuration(db, date, req.SleepTime, wakeTime, duration), date)
		if req.WakeTime != "" {
			log.WakeBonusExp = applyWakeBonus(db, wakeTime)
		}

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

		// 退还旧的晚睡扣分
		if log.Penalized && log.PenaltyExp > 0 {
			refundStats(db, log.PenaltyExp)
		}
		// 撤销旧的时长奖惩和起床奖励（正数=曾加分需扣回，负数=曾扣分需补回）
		revertAward(db, log.BonusExp)
		revertAward(db, log.WakeBonusExp)

		// 重新计算晚睡惩罚
		log.SleepTime = sleepTime
		log.WakeTime = wakeTime
		log.Duration = duration
		log.Penalized = isSleepPenalized(sleepTime)
		log.PenaltyExp = 0
		if log.Penalized {
			log.PenaltyExp = applyLatePenalty(db)
		}

		// 重新计算时长奖惩和起床奖励
		log.BonusExp = applyDurationBonus(db, duration, rewardableDuration(db, log.Date, sleepTime, wakeTime, duration), log.Date)
		log.WakeBonusExp = applyWakeBonus(db, wakeTime)

		db.Save(&log)

		c.JSON(http.StatusOK, log)
	}
}

// ImportSleepLogReq 外部自动同步过来的睡眠记录（iOS HealthKit / Garmin 等）
type ImportSleepLogReq struct {
	Date      string `json:"date"`       // YYYY-MM-DD（起床那天）
	SleepTime string `json:"sleep_time"` // HH:MM 入睡时间
	WakeTime  string `json:"wake_time"`  // HH:MM 起床时间，可选
	Source    string `json:"source"`     // 来源标签（healthkit / garmin），可选，默认 healthkit
	// Garmin 的下次睡眠需求（nextSleepNeed）：建议时长分钟数 + 其对应日期（起床那天）。
	// 可选；传了就存进 UserConfig，供前端「今晚建议入睡」自动倒推，免去手填。
	SleepNeedMinutes int    `json:"sleep_need_minutes"`
	SleepNeedDate    string `json:"sleep_need_date"`
	// 实际睡着 / 夜间清醒分钟数（Garmin sleepTimeSeconds / awakeSleepSeconds），可选，用于睡眠效率
	AsleepMinutes int `json:"asleep_minutes"`
	AwakeMinutes  int `json:"awake_minutes"`
}

// SleepNeedConfigKey 存 Garmin 建议睡眠时长的 UserConfig key（前端同名读取）
const SleepNeedConfigKey = "garmin_sleep_need"

// ImportSleepLog 外部自动同步入口（iOS HealthKit / Garmin 定时任务等）。
// 行为：
//   - 当天没有记录 → 创建，并计算奖惩
//   - 当天已有 manual 记录 → 跳过（手动永远优先，自动源不覆盖）
//   - 当天已有自动记录（healthkit/garmin）且时间未变 → 幂等跳过（多次同步不反复退/发积分）
//   - 当天已有自动记录且时间有变 → 更新时间，重算时长/奖惩，并补退之前的奖惩
//
// 鉴权：单独的 X-Import-Secret 头（env 配置 SLEEP_IMPORT_SECRET），与主 access code 分离，
// 方便给 iOS Shortcut / Garmin 同步脚本用长期 token。
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

		// 来源标签：不传默认 healthkit（保持 iOS 调用方向后兼容）
		source := req.Source
		if source == "" {
			source = "healthkit"
		}

		// 顺带保存 Garmin 建议睡眠时长。独立于睡眠记录本身：
		// 即使下面因「手动优先」跳过写记录，这个建议值也应该更新。
		if req.SleepNeedMinutes > 0 && req.SleepNeedDate != "" {
			payload, _ := json.Marshal(map[string]any{
				"date":    req.SleepNeedDate,
				"minutes": req.SleepNeedMinutes,
			})
			upsertConfig(db, SleepNeedConfigKey, string(payload))
		}

		duration, err := calcSleepDuration(req.Date, req.SleepTime, wakeTime)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("时间格式错误: %v", err)})
			return
		}

		var existing model.SleepLog
		findErr := db.Where("date = ?", req.Date).First(&existing).Error

		// 已存在手动记录 → 不动，告诉调用方跳过（只有 manual 受保护，自动源之间可互相更新）
		if findErr == nil && existing.Source == "manual" {
			fillSleepMinutes(db, &existing, req.AsleepMinutes, req.AwakeMinutes)
			c.JSON(http.StatusOK, gin.H{
				"skipped": true,
				"reason":  "manual record exists, auto-sync will not overwrite",
				"log":     existing,
			})
			return
		}

		// 幂等：已有自动记录且入睡/起床时间都没变 → 直接跳过，避免一天多次同步反复退还/重发积分
		if findErr == nil && existing.SleepTime == req.SleepTime && existing.WakeTime == wakeTime {
			fillSleepMinutes(db, &existing, req.AsleepMinutes, req.AwakeMinutes)
			c.JSON(http.StatusOK, gin.H{"unchanged": true, "log": existing})
			return
		}

		// 已有自动记录且时间有变 → 退还旧奖惩，重新计算，更新时间
		if findErr == nil {
			if existing.Penalized && existing.PenaltyExp > 0 {
				refundStats(db, existing.PenaltyExp)
			}
			revertAward(db, existing.BonusExp)
			revertAward(db, existing.WakeBonusExp)
			existing.SleepTime = req.SleepTime
			existing.WakeTime = wakeTime
			existing.Duration = duration
			existing.Penalized = isSleepPenalized(req.SleepTime)
			existing.PenaltyExp = 0
			if existing.Penalized {
				existing.PenaltyExp = applyLatePenalty(db)
			}
			existing.BonusExp = applyDurationBonus(db, duration, rewardableDuration(db, req.Date, req.SleepTime, wakeTime, duration), req.Date)
			existing.WakeBonusExp = 0
			if req.WakeTime != "" {
				existing.WakeBonusExp = applyWakeBonus(db, wakeTime)
			}
			existing.Source = source
			existing.AsleepMinutes = req.AsleepMinutes
			existing.AwakeMinutes = req.AwakeMinutes
			db.Save(&existing)
			c.JSON(http.StatusOK, gin.H{"updated": true, "log": existing})
			return
		}

		// 全新创建
		log := model.SleepLog{
			Date:          req.Date,
			SleepTime:     req.SleepTime,
			WakeTime:      wakeTime,
			Duration:      duration,
			Source:        source,
			AsleepMinutes: req.AsleepMinutes,
			AwakeMinutes:  req.AwakeMinutes,
		}
		log.Penalized = isSleepPenalized(req.SleepTime)
		if log.Penalized {
			log.PenaltyExp = applyLatePenalty(db)
		}
		log.BonusExp = applyDurationBonus(db, duration, rewardableDuration(db, req.Date, req.SleepTime, wakeTime, duration), req.Date)
		if req.WakeTime != "" {
			log.WakeBonusExp = applyWakeBonus(db, wakeTime)
		}
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

		// 退还晚睡扣分
		if log.Penalized && log.PenaltyExp > 0 {
			refundStats(db, log.PenaltyExp)
		}
		// 撤销时长奖惩和起床奖励
		revertAward(db, log.BonusExp)
		revertAward(db, log.WakeBonusExp)

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
// 只返回布尔值；扣分由 applyLatePenalty 在记录睡眠时一次性执行
func isSleepPenalized(sleepTimeStr string) bool {
	var h, m int
	fmt.Sscanf(sleepTimeStr, "%d:%d", &h, &m)
	isLateNight := h >= 0 && h < 6
	return isLateNight && (h > penaltyThresholdHour || (h == penaltyThresholdHour && m > penaltyThresholdMin))
}

// applyLatePenalty 晚睡固定扣 lateSleepPenaltyExp 分，返回扣除额（存进 PenaltyExp，撤销时原样退还）
func applyLatePenalty(db *gorm.DB) float64 {
	var stats model.UserStats
	db.First(&stats)
	penalty := lateSleepPenaltyExp
	// 不把积分扣成负数；实际扣了多少就记多少，撤销时退还的才准确
	if stats.SpendableExp < penalty {
		penalty = stats.SpendableExp
	}
	if penalty <= 0 {
		return 0
	}
	stats.SpendableExp -= penalty
	stats.TotalExp -= penalty
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
				Where("datetime(completed_at) >= datetime(?) AND datetime(completed_at) < datetime(?)", dayStart.UTC(), dayEnd.UTC()).
				Scan(&r)

			if r.Total <= 0 {
				continue
			}

			// 历史任务积分是满额发的（未被实时惩罚），按当时的 20% 补算（不跟随现行 lateSleepPenaltyRate）
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
//   - 实际睡眠 <6h：扣该日任务积分 20%（按实际时长判断，补觉不会被罚）
//   - 奖励按 rewardHours（只算到固定起床时间 + 宽限，见 rewardableDuration）：
//     6-7h 线性 0 → 12，7-8h 线性 12 → 52，>=8h 封顶 52；不足 6h 不奖励
func applyDurationBonus(db *gorm.DB, duration, rewardHours float64, date string) float64 {
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
			Where("datetime(completed_at) >= datetime(?) AND datetime(completed_at) < datetime(?)", dayStart.UTC(), dayEnd.UTC()).
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

	// 奖励：分两段线性插值，8h 封顶
	//   6-7h: 0 → 12  (斜率 12/h)
	//   7-8h: 12 → 52 (斜率 40/h)
	var bonus float64
	switch {
	case rewardHours < 6:
		return 0
	case rewardHours < 7:
		bonus = (rewardHours - 6) * 12
	case rewardHours <= 8:
		bonus = 12 + (rewardHours-7)*40
	default:
		bonus = 52
	}
	// 保留 1 位小数
	bonus = math.Round(bonus*10) / 10

	stats.TotalExp += bonus
	// 睡眠奖励同样优先注入进行中的心愿——早睡挣的分正是拿来还心愿的
	routed := contributeActiveWish(db, bonus)
	stats.SpendableExp += bonus - routed
	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)
	return bonus
}

// rewardableDuration 时长奖励只算到「固定起床时间 + wakeBonusToleranceMin」为止，
// 之后多睡的部分不加分：凌晨 4 点睡、睡到中午不再能拿满时长奖励，想拿满只能早点睡。
func rewardableDuration(db *gorm.DB, date, sleepTime, wakeTime string, actual float64) float64 {
	fixed := getConfig(db, fixedWakeConfigKey, fixedWakeDefault)
	ft, err1 := time.Parse("15:04", fixed)
	wt, err2 := time.Parse("15:04", wakeTime)
	if err1 != nil || err2 != nil {
		return actual
	}
	cutoff := ft.Add(wakeBonusToleranceMin * time.Minute)
	if !wt.After(cutoff) {
		return actual // 没有睡过头，全部计入
	}
	d, err := calcSleepDuration(date, sleepTime, cutoff.Format("15:04"))
	if err != nil {
		return actual
	}
	if d > actual {
		return 0 // 入睡本身就在截止点之后（如白天补觉），截止点前没有可奖励的睡眠
	}
	return d
}

// applyWakeBonus 实际起床时间与固定起床时间相差不超过 wakeBonusToleranceMin 分钟时发奖励，返回发放额
func applyWakeBonus(db *gorm.DB, wakeTime string) float64 {
	fixed := getConfig(db, fixedWakeConfigKey, fixedWakeDefault)
	diff, ok := clockDiffMinutes(wakeTime, fixed)
	if !ok || diff > wakeBonusToleranceMin {
		return 0
	}
	grantExp(db, wakeBonusExp)
	return wakeBonusExp
}

// clockDiffMinutes 两个 HH:MM 的分钟差绝对值。起床时间都在白天，不考虑跨午夜。
func clockDiffMinutes(a, b string) (int, bool) {
	ta, errA := time.Parse("15:04", a)
	tb, errB := time.Parse("15:04", b)
	if errA != nil || errB != nil {
		return 0, false
	}
	d := int(ta.Sub(tb).Minutes())
	if d < 0 {
		d = -d
	}
	return d, true
}

// fillSleepMinutes 只补 / 更新睡眠效率数据，不动时间和积分
func fillSleepMinutes(db *gorm.DB, log *model.SleepLog, asleep, awake int) {
	if asleep <= 0 || (log.AsleepMinutes == asleep && log.AwakeMinutes == awake) {
		return
	}
	log.AsleepMinutes = asleep
	log.AwakeMinutes = awake
	db.Model(log).Updates(map[string]any{"asleep_minutes": asleep, "awake_minutes": awake})
}

// grantExp 发放一笔正向奖励：计入总经验；有进行中的心愿时优先注入心愿池，剩下的进可用积分
func grantExp(db *gorm.DB, amount float64) {
	if amount <= 0 {
		return
	}
	var stats model.UserStats
	db.First(&stats)
	stats.TotalExp += amount
	routed := contributeActiveWish(db, amount)
	stats.SpendableExp += amount - routed
	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)
}

// revertAward 撤销一笔已发放的奖惩：正数（曾加分）扣回，负数（曾扣分）补回。
// 以前这里误用了 refundStats（只会加分、且遇到负数直接返回），导致编辑 / 删除 / 同步更新时
// 正奖励被重复发放、负奖励永远补不回来。
// 边界：当初若有部分注入了心愿池，这里统一从可用积分扣回，不回滚心愿进度。
func revertAward(db *gorm.DB, amount float64) {
	if amount == 0 {
		return
	}
	var stats model.UserStats
	db.First(&stats)
	stats.TotalExp -= amount
	stats.SpendableExp -= amount
	if stats.TotalExp < 0 {
		stats.TotalExp = 0
	}
	if stats.SpendableExp < 0 {
		stats.SpendableExp = 0
	}
	stats.Level = calcLevel(stats.TotalExp)
	db.Save(&stats)
}

// refundStats 退还积分到 UserStats（只用于退还晚睡扣分 PenaltyExp，它是正数的扣除额）
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
