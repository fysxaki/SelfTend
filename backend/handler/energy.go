package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

type CreateEnergyLogReq struct {
	Date        string `json:"date"`         // YYYY-MM-DD，不填则用今天
	EnergyLevel int    `json:"energy_level"` // 1-5
	Note        string `json:"note"`
}

// CreateEnergyLog 创建今日能量记录
func CreateEnergyLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateEnergyLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.EnergyLevel < 1 || req.EnergyLevel > 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "energy_level 必须在 1-5 之间"})
			return
		}

		date := req.Date
		if date == "" {
			date = time.Now().In(cst).Format("2006-01-02")
		}

		// 检查当天是否已有记录
		var existing model.EnergyLog
		if err := db.Where("date = ?", date).First(&existing).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该日期已有能量记录，请使用编辑功能"})
			return
		}

		log := model.EnergyLog{
			Date:        date,
			EnergyLevel: req.EnergyLevel,
			Note:        req.Note,
		}
		db.Create(&log)
		c.JSON(http.StatusOK, log)
	}
}

// ImportEnergyLogReq 外部自动同步（Garmin 身体电量等）
type ImportEnergyLogReq struct {
	Date        string `json:"date"`         // YYYY-MM-DD（不填=今天）
	EnergyLevel int    `json:"energy_level"` // 1-5
	Note        string `json:"note"`
	Source      string `json:"source"` // 来源标签，可选，默认 garmin
}

// ImportEnergyLog 外部自动同步入口（走 X-Import-Secret，与睡眠导入同一套鉴权）。
// 行为：
//   - 当天无记录 → 创建
//   - 当天已有手动记录（source=manual 或空）→ 跳过，手动永远优先
//   - 当天已有自动记录且能量值未变 → 幂等跳过
//   - 当天已有自动记录且值有变 → 更新
//
// 能量记录没有积分奖惩联动，写入是纯记录，不影响积分。
func ImportEnergyLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ImportEnergyLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.EnergyLevel < 1 || req.EnergyLevel > 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "energy_level 必须在 1-5 之间"})
			return
		}

		date := req.Date
		if date == "" {
			date = time.Now().In(cst).Format("2006-01-02")
		}
		source := req.Source
		if source == "" {
			source = "garmin"
		}

		var existing model.EnergyLog
		findErr := db.Where("date = ?", date).First(&existing).Error

		// 手动记录不覆盖。Source 字段晚于本表加入，历史手填记录为空值，故空值也按手动处理
		if findErr == nil && (existing.Source == "manual" || existing.Source == "") {
			c.JSON(http.StatusOK, gin.H{
				"skipped": true,
				"reason":  "manual record exists, auto-sync will not overwrite",
				"log":     existing,
			})
			return
		}

		// 幂等：同一自动记录且能量值没变 → 跳过
		if findErr == nil && existing.EnergyLevel == req.EnergyLevel {
			c.JSON(http.StatusOK, gin.H{"unchanged": true, "log": existing})
			return
		}

		if findErr == nil {
			existing.EnergyLevel = req.EnergyLevel
			existing.Note = req.Note
			existing.Source = source
			db.Save(&existing)
			c.JSON(http.StatusOK, gin.H{"updated": true, "log": existing})
			return
		}

		log := model.EnergyLog{
			Date:        date,
			EnergyLevel: req.EnergyLevel,
			Note:        req.Note,
			Source:      source,
		}
		db.Create(&log)
		c.JSON(http.StatusOK, gin.H{"created": true, "log": log})
	}
}

// GetEnergyLogs 获取能量记录列表
func GetEnergyLogs(db *gorm.DB) gin.HandlerFunc {
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

		var logs []model.EnergyLog
		query.Find(&logs)
		c.JSON(http.StatusOK, logs)
	}
}

// UpdateEnergyLog 编辑能量记录
func UpdateEnergyLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var log model.EnergyLog
		if err := db.First(&log, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}

		var req CreateEnergyLogReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.EnergyLevel < 1 || req.EnergyLevel > 5 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "energy_level 必须在 1-5 之间"})
			return
		}

		log.EnergyLevel = req.EnergyLevel
		log.Note = req.Note
		db.Save(&log)
		c.JSON(http.StatusOK, log)
	}
}

// DeleteEnergyLog 删除能量记录
func DeleteEnergyLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var log model.EnergyLog
		if err := db.First(&log, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}
		db.Delete(&log)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
