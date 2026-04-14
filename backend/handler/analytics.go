package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// AnalyticsItem 单天的聚合数据
type AnalyticsItem struct {
	Date        string  `json:"date"`
	SleepTime   string  `json:"sleep_time"`   // 入睡时间 HH:MM
	Duration    float64 `json:"duration"`     // 睡眠时长（小时）
	EnergyLevel int     `json:"energy_level"` // 1-5，0 表示未记录
	Penalized   bool    `json:"penalized"`    // 是否触发惩罚
	PenaltyExp  float64 `json:"penalty_exp"`  // 被扣积分
}

// GetAnalytics 返回指定日期范围内的聚合数据（睡眠 + 能量）
func GetAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		startDate := c.Query("start_date")
		endDate := c.Query("end_date")

		// 默认最近 30 天
		if startDate == "" {
			startDate = time.Now().In(cst).AddDate(0, 0, -29).Format("2006-01-02")
		}
		if endDate == "" {
			endDate = time.Now().In(cst).Format("2006-01-02")
		}

		// 查询睡眠记录
		var sleepLogs []model.SleepLog
		db.Where("date >= ? AND date <= ?", startDate, endDate).
			Order("date asc").Find(&sleepLogs)

		// 查询能量记录
		var energyLogs []model.EnergyLog
		db.Where("date >= ? AND date <= ?", startDate, endDate).
			Order("date asc").Find(&energyLogs)

		// 以日期为 key 构建 map
		sleepMap := make(map[string]model.SleepLog)
		for _, s := range sleepLogs {
			sleepMap[s.Date] = s
		}
		energyMap := make(map[string]model.EnergyLog)
		for _, e := range energyLogs {
			energyMap[e.Date] = e
		}

		// 生成完整日期列表（只返回有任意一条记录的日期）
		dateSet := make(map[string]bool)
		for _, s := range sleepLogs {
			dateSet[s.Date] = true
		}
		for _, e := range energyLogs {
			dateSet[e.Date] = true
		}

		var items []AnalyticsItem
		for date := range dateSet {
			item := AnalyticsItem{Date: date}

			if s, ok := sleepMap[date]; ok {
				item.SleepTime = s.SleepTime
				item.Duration = s.Duration
				item.Penalized = s.Penalized
				item.PenaltyExp = s.PenaltyExp
			}
			if e, ok := energyMap[date]; ok {
				item.EnergyLevel = e.EnergyLevel
			}
			items = append(items, item)
		}

		// 按日期升序排序
		sortAnalytics(items)

		c.JSON(http.StatusOK, items)
	}
}

// sortAnalytics 按日期字符串升序排序
func sortAnalytics(items []AnalyticsItem) {
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j].Date < items[j-1].Date; j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
}
