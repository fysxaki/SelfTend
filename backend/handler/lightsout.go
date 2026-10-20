package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// 入睡耗时超过这个值视为数据异常（如 Garmin 误判入睡、忘了打卡隔很久才补），不参与统计
const maxSleepLatencyMinutes = 240

type lightsOutReq struct {
	NightDate string `json:"night_date"`
	Time      string `json:"time"` // HH:MM
}

// GetLightsOut 按日期范围返回关灯记录（night_date 闭区间）
func GetLightsOut(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := db.Order("night_date desc")
		if start := c.Query("start_date"); start != "" {
			query = query.Where("night_date >= ?", start)
		}
		if end := c.Query("end_date"); end != "" {
			query = query.Where("night_date <= ?", end)
		}
		logs := []model.LightsOutLog{}
		query.Find(&logs)
		c.JSON(http.StatusOK, logs)
	}
}

// SetLightsOut 记录 / 更新某一晚的关灯时间。再次打卡直接覆盖：
// 按 20 分钟规则起身后重新躺下，入睡耗时应从最后一次躺下算起。
func SetLightsOut(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req lightsOutReq
		if err := c.ShouldBindJSON(&req); err != nil || req.NightDate == "" || req.Time == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "night_date 和 time 必填"})
			return
		}
		if _, err := time.Parse("15:04", req.Time); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "time 格式应为 HH:MM"})
			return
		}
		if !nightDateAllowed(req.NightDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "只能记录今晚或昨晚的关灯时间"})
			return
		}

		var log model.LightsOutLog
		if db.Where("night_date = ?", req.NightDate).First(&log).Error == nil {
			log.Time = req.Time
			db.Save(&log)
		} else {
			log = model.LightsOutLog{NightDate: req.NightDate, Time: req.Time}
			db.Create(&log)
		}
		c.JSON(http.StatusOK, log)
	}
}

// DeleteLightsOut 撤销某一晚的关灯打卡（点错时用）
func DeleteLightsOut(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		db.Where("night_date = ?", c.Param("night")).Delete(&model.LightsOutLog{})
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// sleepLatencyMinutes 入睡耗时 = 入睡时间 − 关灯时间。两者都是夜里的 HH:MM，
// 中午之前的时间视为次日凌晨再相减；结果为负或超过上限时返回 ok=false。
func sleepLatencyMinutes(lightsOut, sleepOnset string) (int, bool) {
	toNightMin := func(hhmm string) (int, bool) {
		t, err := time.Parse("15:04", hhmm)
		if err != nil {
			return 0, false
		}
		m := t.Hour()*60 + t.Minute()
		if m < 12*60 {
			m += 24 * 60
		}
		return m, true
	}
	lo, ok1 := toNightMin(lightsOut)
	on, ok2 := toNightMin(sleepOnset)
	if !ok1 || !ok2 {
		return 0, false
	}
	d := on - lo
	if d < 0 || d > maxSleepLatencyMinutes {
		return 0, false
	}
	return d, true
}
