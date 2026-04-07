package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

func GetPrizes(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var prizes []model.Prize
		db.Order("cost asc").Find(&prizes)
		c.JSON(http.StatusOK, prizes)
	}
}

func CreatePrize(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var prize model.Prize
		if err := c.ShouldBindJSON(&prize); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		db.Create(&prize)
		c.JSON(http.StatusOK, prize)
	}
}

func UpdatePrize(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var prize model.Prize
		if err := db.First(&prize, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err := c.ShouldBindJSON(&prize); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		prize.ID = uint(id)
		db.Save(&prize)
		c.JSON(http.StatusOK, prize)
	}
}

func DeletePrize(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		db.Delete(&model.Prize{}, id)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func RedeemPrize(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))

		var prize model.Prize
		if err := db.First(&prize, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "prize not found"})
			return
		}
		if prize.Redeemed {
			c.JSON(http.StatusBadRequest, gin.H{"error": "already redeemed"})
			return
		}

		var stats model.UserStats
		db.First(&stats)
		if stats.SpendableExp < prize.Cost {
			c.JSON(http.StatusBadRequest, gin.H{"error": "insufficient points"})
			return
		}

		stats.SpendableExp -= prize.Cost
		db.Save(&stats)

		now := time.Now()
		prize.Redeemed = true
		prize.RedeemedAt = &now
		db.Save(&prize)

		c.JSON(http.StatusOK, gin.H{"prize": prize, "stats": stats})
	}
}
