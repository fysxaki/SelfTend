package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"selftend/model"
)

func GetSeasons(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var seasons []model.Season
		db.Order("created_at desc").Find(&seasons)
		c.JSON(http.StatusOK, seasons)
	}
}

func CreateSeason(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var season model.Season
		if err := c.ShouldBindJSON(&season); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		db.Create(&season)
		c.JSON(http.StatusOK, season)
	}
}

func GetSeason(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var season model.Season
		if err := db.First(&season, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.JSON(http.StatusOK, season)
	}
}

func UpdateSeason(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.Atoi(c.Param("id"))
		var season model.Season
		if err := db.First(&season, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		if err := c.ShouldBindJSON(&season); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		season.ID = uint(id)
		db.Save(&season)
		c.JSON(http.StatusOK, season)
	}
}
