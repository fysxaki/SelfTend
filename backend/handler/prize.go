package handler

import (
	"fmt"
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
		var stats model.UserStats

		// 用事务：扣分和标记 redeemed 必须同生同灭，任一失败全部回滚
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.First(&prize, id).Error; err != nil {
				return fmt.Errorf("prize not found")
			}
			if prize.Redeemed {
				return fmt.Errorf("already redeemed")
			}

			if err := tx.First(&stats).Error; err != nil {
				return err
			}
			if stats.SpendableExp < prize.Cost {
				return fmt.Errorf("insufficient points")
			}

			stats.SpendableExp -= prize.Cost
			if err := tx.Save(&stats).Error; err != nil {
				return err
			}

			now := time.Now()
			prize.Redeemed = true
			prize.RedeemedAt = &now
			if err := tx.Save(&prize).Error; err != nil {
				return err
			}

			// 写一条兑换流水（快照奖品信息，奖品日后被删也不丢历史）
			redemption := model.RedemptionLog{
				PrizeID:       prize.ID,
				PrizeName:     prize.Name,
				PrizeCategory: prize.Category,
				Cost:          prize.Cost,
				RedeemedAt:    now,
			}
			return tx.Create(&redemption).Error
		})

		if err != nil {
			// 业务错误统一返回 400，DB 错误返回 500
			msg := err.Error()
			switch msg {
			case "prize not found":
				c.JSON(http.StatusNotFound, gin.H{"error": msg})
			case "already redeemed", "insufficient points":
				c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			default:
				c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
			}
			return
		}

		c.JSON(http.StatusOK, gin.H{"prize": prize, "stats": stats})
	}
}

// GetRedemptions 返回兑换流水（按兑换时间倒序），默认最多 100 条
func GetRedemptions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
		var logs []model.RedemptionLog
		db.Order("redeemed_at desc").Limit(limit).Find(&logs)
		c.JSON(http.StatusOK, logs)
	}
}

// BackfillRedemptions 一次性回填历史兑换流水：
// 兑换记录功能上线前兑换的奖品没写流水，这里扫描仍留在商店里、标记了 redeemed 的奖品，
// 按其快照补写一条 RedemptionLog。按 prize_id 去重，重复运行安全（幂等）。
// 注意：兑换后又被删除的奖品无法找回（奖品行已不存在）。
func BackfillRedemptions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var prizes []model.Prize
		db.Where("redeemed = ?", true).Find(&prizes)

		created := 0
		skipped := 0
		for _, p := range prizes {
			// 已有该奖品的流水则跳过，避免重复补
			var count int64
			db.Model(&model.RedemptionLog{}).Where("prize_id = ?", p.ID).Count(&count)
			if count > 0 {
				skipped++
				continue
			}

			// redeemed=true 正常都带 RedeemedAt；极旧数据缺失时用当前时间兜底
			redeemedAt := time.Now()
			if p.RedeemedAt != nil {
				redeemedAt = *p.RedeemedAt
			}

			db.Create(&model.RedemptionLog{
				PrizeID:       p.ID,
				PrizeName:     p.Name,
				PrizeCategory: p.Category,
				Cost:          p.Cost,
				RedeemedAt:    redeemedAt,
			})
			created++
		}

		c.JSON(http.StatusOK, gin.H{"created": created, "skipped": skipped})
	}
}
