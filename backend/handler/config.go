package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

// GetUserConfig 读取一项用户配置（key-value），不存在返回空字符串
func GetUserConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.Param("key")
		var cfg model.UserConfig
		if err := db.Where("key = ?", key).First(&cfg).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"key": key, "value": ""})
			return
		}
		c.JSON(http.StatusOK, gin.H{"key": key, "value": cfg.Value})
	}
}

type SetUserConfigReq struct {
	Value string `json:"value"`
}

// SetUserConfig 写入/更新一项用户配置
func SetUserConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.Param("key")
		var req SetUserConfigReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var cfg model.UserConfig
		if err := db.Where("key = ?", key).First(&cfg).Error; err == nil {
			cfg.Value = req.Value
			db.Save(&cfg)
		} else {
			cfg = model.UserConfig{Key: key, Value: req.Value}
			db.Create(&cfg)
		}
		c.JSON(http.StatusOK, gin.H{"key": key, "value": cfg.Value})
	}
}
