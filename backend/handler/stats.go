package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

func GetStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var stats model.UserStats
		// 没有记录则自动创建初始数据
		result := db.First(&stats)
		if result.Error != nil {
			stats = model.UserStats{Level: 1}
			db.Create(&stats)
		}
		c.JSON(http.StatusOK, stats)
	}
}
