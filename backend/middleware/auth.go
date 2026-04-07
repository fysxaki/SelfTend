package middleware

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// AccessCode 读取环境变量 ACCESS_CODE，校验请求头 X-Access-Code
func AccessCode() gin.HandlerFunc {
	code := os.Getenv("ACCESS_CODE")
	if code == "" {
		code = "dev-no-auth" // 本地开发未设置环境变量时跳过校验
	}

	return func(c *gin.Context) {
		// 本地开发模式直接放行
		if code == "dev-no-auth" {
			c.Next()
			return
		}

		clientCode := c.GetHeader("X-Access-Code")
		if clientCode != code {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// CheckCode 用于前端验证访问码是否正确
func CheckCode() gin.HandlerFunc {
	return func(c *gin.Context) {
		code := os.Getenv("ACCESS_CODE")
		if code == "" {
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}

		var req struct {
			Code string `json:"code"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Code != code {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "wrong code"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
