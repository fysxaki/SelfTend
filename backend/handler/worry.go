package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

type CreateWorryReq struct {
	Content    string `json:"content"`
	HandleDate string `json:"handle_date"` // YYYY-MM-DD，不填默认明天
}

// CreateWorryNote 记下一条焦虑念头
func CreateWorryNote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateWorryReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Content == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "content 不能为空"})
			return
		}

		handleDate := req.HandleDate
		if handleDate == "" {
			// 默认明天处理
			handleDate = time.Now().In(cst).AddDate(0, 0, 1).Format("2006-01-02")
		}

		note := model.WorryNote{
			Content:    req.Content,
			HandleDate: handleDate,
		}
		db.Create(&note)
		c.JSON(http.StatusOK, note)
	}
}

// GetWorryNotes 获取焦虑暂存列表
// query: status=due（已到期未处理）/ pending（未到期未处理）/ resolved（已处理）/ 空=全部未处理
func GetWorryNotes(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := c.Query("status")
		today := time.Now().In(cst).Format("2006-01-02")

		query := db.Order("handle_date asc, created_at desc")
		switch status {
		case "due":
			query = query.Where("resolved = ? AND handle_date <= ?", false, today)
		case "pending":
			query = query.Where("resolved = ? AND handle_date > ?", false, today)
		case "resolved":
			query = query.Where("resolved = ?", true).Order("resolved_at desc")
		default:
			query = query.Where("resolved = ?", false)
		}

		var notes []model.WorryNote
		query.Find(&notes)
		if notes == nil {
			notes = []model.WorryNote{}
		}
		c.JSON(http.StatusOK, notes)
	}
}

// ResolveWorryNote 标记一条焦虑为已处理（或撤销处理）
func ResolveWorryNote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var note model.WorryNote
		if err := db.First(&note, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}

		var req struct {
			Resolved bool `json:"resolved"`
		}
		_ = c.ShouldBindJSON(&req)

		note.Resolved = req.Resolved
		if req.Resolved {
			now := time.Now()
			note.ResolvedAt = &now
		} else {
			note.ResolvedAt = nil
		}
		db.Save(&note)
		c.JSON(http.StatusOK, note)
	}
}

// UpdateWorryNote 编辑内容或改处理日期（比如「再放一天」）
func UpdateWorryNote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var note model.WorryNote
		if err := db.First(&note, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}

		var req CreateWorryReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if req.Content != "" {
			note.Content = req.Content
		}
		if req.HandleDate != "" {
			note.HandleDate = req.HandleDate
		}
		db.Save(&note)
		c.JSON(http.StatusOK, note)
	}
}

// DeleteWorryNote 删除一条焦虑记录
func DeleteWorryNote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var note model.WorryNote
		if err := db.First(&note, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
			return
		}
		db.Delete(&note)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
