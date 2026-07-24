package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

const (
	// 单笔心愿价格上限（元）：护栏，超过必须走「先攒够再买」，防冲动大额下单
	wishPriceCapYuan = 550.0
	// 同时进行中的心愿数：1——必须还清当前的才能启用下一个
	wishMaxConcurrent = 1
)

// contributeActiveWish 若有进行中的心愿，把新增可用积分 100% 优先注入其中，
// 返回注入到心愿的金额（调用方应从可用积分里扣掉这部分）。
// 只对「正向收益」调用；退款、惩罚不注入。
func contributeActiveWish(db *gorm.DB, gain float64) float64 {
	if gain <= 0 {
		return 0
	}
	var wish model.Wish
	if err := db.Where("status = ?", "active").Order("purchased_at asc").First(&wish).Error; err != nil {
		return 0 // 没有进行中的心愿
	}
	remaining := wish.TargetExp - wish.EarnedExp
	if remaining <= 0 {
		return 0
	}
	routed := gain
	if routed > remaining {
		routed = remaining // 只注入到填满为止，多余留给可用积分
	}
	wish.EarnedExp += routed
	if wish.EarnedExp >= wish.TargetExp {
		wish.EarnedExp = wish.TargetExp
		wish.Status = "done"
		now := time.Now()
		wish.DoneAt = &now
	}
	db.Save(&wish)
	return routed
}

type CreateWishReq struct {
	Title     string  `json:"title"`
	Reason    string  `json:"reason"`
	PriceYuan float64 `json:"price_yuan"`
	TargetExp float64 `json:"target_exp"` // 可选，不填默认 = price_yuan（1 分 = 1 元）
}

// CreateWish 登记一个心愿（B 模式：已用真钱买下，开始挣回）
func CreateWish(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateWishReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Title == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "心愿名称不能为空"})
			return
		}
		if req.PriceYuan <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "价格必须大于 0"})
			return
		}
		// 护栏 1：单笔价格上限
		if req.PriceYuan > wishPriceCapYuan {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "超过单笔上限 ¥" + strconv.FormatFloat(wishPriceCapYuan, 'f', 0, 64) + "，这种大额心愿建议走「先攒够再买」",
			})
			return
		}
		// 护栏 2：同时只能有 wishMaxConcurrent 个进行中
		var activeCount int64
		db.Model(&model.Wish{}).Where("status = ?", "active").Count(&activeCount)
		if activeCount >= wishMaxConcurrent {
			c.JSON(http.StatusBadRequest, gin.H{"error": "已有进行中的心愿，先把它挣回来才能启用下一个"})
			return
		}

		target := req.TargetExp
		if target <= 0 {
			target = req.PriceYuan // 默认 1 分 = 1 元
		}

		wish := model.Wish{
			Title:       req.Title,
			Reason:      req.Reason,
			PriceYuan:   req.PriceYuan,
			TargetExp:   target,
			EarnedExp:   0,
			Status:      "active",
			PurchasedAt: time.Now(),
		}
		db.Create(&wish)
		c.JSON(http.StatusOK, wish)
	}
}

// GetWishes 获取心愿列表（进行中在前，已还清在后）
func GetWishes(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var wishes []model.Wish
		// active 排前面，其余按购买时间倒序
		db.Order("CASE status WHEN 'active' THEN 0 ELSE 1 END, purchased_at desc").Find(&wishes)
		if wishes == nil {
			wishes = []model.Wish{}
		}
		c.JSON(http.StatusOK, gin.H{
			"wishes":         wishes,
			"price_cap_yuan": wishPriceCapYuan,
			"max_concurrent": wishMaxConcurrent,
		})
	}
}

// DeleteWish 删除一个心愿（不影响已发放的积分/等级）
func DeleteWish(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var wish model.Wish
		if err := db.First(&wish, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}
		db.Delete(&wish)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
