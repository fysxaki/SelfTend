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
