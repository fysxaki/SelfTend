package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// 每完成一个睡前锚点（手机离开卧室、写烦恼清单等）发的积分。
// CBT-I 思路：奖励自己能控制的动作，而不是「几点睡着」这种没法靠意志决定的结果。
const windDownStepExp = 5.0

type windDownCheckReq struct {
	NightDate string `json:"night_date"` // 这一晚的日期，凌晨 6 点前算前一晚（前端负责换算）
	StepKey   string `json:"step_key"`
	Checked   bool   `json:"checked"`
}

// nightDateAllowed 只允许打卡今晚或昨晚，防止补打很久以前的卡刷分
func nightDateAllowed(night string) bool {
	now := time.Now().In(cst)
	return night == now.Format("2006-01-02") || night == now.AddDate(0, 0, -1).Format("2006-01-02")
}

func windDownKeys(db *gorm.DB, night string) []string {
	keys := []string{}
	db.Model(&model.WindDownCheck{}).Where("night_date = ?", night).Pluck("step_key", &keys)
	return keys
}

// GetWindDownChecks 返回某一晚已打卡的锚点 key 列表
func GetWindDownChecks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		night := c.Query("night")
		if night == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "night 必填"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"keys": windDownKeys(db, night)})
	}
}

// SetWindDownCheck 打卡 / 取消打卡。打卡发 windDownStepExp，取消时撤销当初发的那笔。
// 唯一索引 (night_date, step_key) 保证同一晚同一锚点最多发一次，连点也不会重复发。
func SetWindDownCheck(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req windDownCheckReq
		if err := c.ShouldBindJSON(&req); err != nil || req.NightDate == "" || req.StepKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "night_date 和 step_key 必填"})
			return
		}
		if !nightDateAllowed(req.NightDate) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "只能打卡今晚或昨晚的锚点"})
			return
		}

		var existing model.WindDownCheck
		found := db.Where("night_date = ? AND step_key = ?", req.NightDate, req.StepKey).First(&existing).Error == nil
		var delta float64

		switch {
		case req.Checked && !found:
			row := model.WindDownCheck{NightDate: req.NightDate, StepKey: req.StepKey, ExpAwarded: windDownStepExp}
			// 并发重复请求时唯一索引会让第二次 Create 失败，此时不发分
			if db.Create(&row).Error == nil {
				grantExp(db, windDownStepExp)
				delta = windDownStepExp
			}
		case !req.Checked && found:
			db.Delete(&existing)
			revertAward(db, existing.ExpAwarded)
			delta = -existing.ExpAwarded
		}

		c.JSON(http.StatusOK, gin.H{"keys": windDownKeys(db, req.NightDate), "exp_delta": delta})
	}
}
