package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// 自动补漏回溯窗口上限，防止一次拉取过多 Garmin 数据触发限流
const maxSyncStatusDays = 30

// SyncStatus 返回最近 N 天里「完全没有记录」的日期，供 Garmin 同步脚本补漏。
//
// 为什么需要：手表要打开手机 App 才会同步到 Garmin 云。若当天最后一次
// 定时任务跑完后用户才同步，那天就漏了；脚本每次只看今天，不会回头补。
// 有了这个接口，脚本每次运行都能把窗口内漏掉的日子一并补齐。
//
// 「缺失」只算完全没有记录的日期：已有手动记录的日子不返回，
// 避免自动同步去覆盖用户手填的内容（手动优先原则）。
//
// 鉴权：与导入接口同一套 X-Import-Secret。
func SyncStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
		if days < 1 {
			days = 1
		}
		if days > maxSyncStatusDays {
			days = maxSyncStatusDays
		}

		today := time.Now().In(cst)
		start := today.AddDate(0, 0, -(days - 1)).Format("2006-01-02")
		end := today.Format("2006-01-02")

		var sleepDates, energyDates []string
		db.Model(&model.SleepLog{}).Where("date >= ? AND date <= ?", start, end).Pluck("date", &sleepDates)
		db.Model(&model.EnergyLog{}).Where("date >= ? AND date <= ?", start, end).Pluck("date", &energyDates)

		has := func(list []string) map[string]bool {
			m := make(map[string]bool, len(list))
			for _, d := range list {
				m[d] = true
			}
			return m
		}
		hasSleep, hasEnergy := has(sleepDates), has(energyDates)

		missingSleep, missingEnergy := []string{}, []string{}
		for i := 0; i < days; i++ {
			d := today.AddDate(0, 0, -i).Format("2006-01-02")
			if !hasSleep[d] {
				missingSleep = append(missingSleep, d)
			}
			if !hasEnergy[d] {
				missingEnergy = append(missingEnergy, d)
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"start":          start,
			"end":            end,
			"missing_sleep":  missingSleep,
			"missing_energy": missingEnergy,
		})
	}
}
