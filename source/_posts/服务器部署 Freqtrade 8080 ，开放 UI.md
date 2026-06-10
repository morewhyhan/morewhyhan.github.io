---
title: 服务器部署 Freqtrade 8080 ，开放 UI
date: 2025-12-29 02:52:30
categories: ['技术','交易']
tags: ['Freqtrade','量化','部署']
---

# 服务器部署 Freqtrade 8080 ，开放 UI

本次核心目标是把服务器本地 `localhost:8080` 的 Freqtrade UI 对外开放，让 Windows 电脑访问，全程解决了**配置缺失、权限、端口映射、安全组**四大核心问题，以下是可复刻的完整步骤.

## 一、前置准备（服务器端）

### 1、登录服务器终端（控制台 / SSH）

``` bash
ssh root@【服务器ip】 -p 22
```

### 2、搭建目录
按照官方的方法搭建
`https://www.freqtrade.io/`
`https://www.freqtrade.cn/`

### 3、进入 Freqtrade 部署目录

```bash
cd ~/Desktop/ft_userdata/my_ft_userdata
```

## 二、核心配置步骤

### 1. 修复日志目录权限（解决「PermissionError 13」）

Freqtrade 启动需要写日志，先开放权限：

```bash
sudo chmod -R 777 user_data/logs/ && sudo chown -R root:root user_data/
```

### 2. 修改 Freqtrade 配置（让 UI 监听所有 IP）

把`config.json`里的监听地址从本地（127.0.0.1）改成所有 IP（0.0.0.0）：

```bash
sed -i 's/"listen_addresses": "127.0.0.1"/"listen_addresses": "0.0.0.0"/g' user_data/config.json
```

### 3. 修改 Docker 端口映射（解决「仅本地映射」）

把 Docker 端口映射从`127.0.0.1:8080`改成`0.0.0.0:8080`，允许外部访问：

```bash
sed -i 's/127.0.0.1:8080:8080/0.0.0.0:8080:8080/g' docker-compose.yml
```

### 4. 开放服务器本地防火墙（Ubuntu/Debian）

放行 8080/TCP 端口，确保本地不拦截：

```bash
ufw enable && ufw allow 8080/tcp && ufw reload
```

### 5. 启动 / 重启 Freqtrade 容器

```bash
docker compose down && docker compose up -d
```

## 三、验证步骤

### 服务器端验证

```bash
# 检查8080端口是否监听所有IP
ss -tulpn | grep 8080  # 输出含「0.0.0.0:8080」则正常
# 检查容器是否运行
docker compose ps  # 输出STATUS为Up则正常
```

### Windows 端验证（PowerShell）

```powershell
# 测试8080端口是否通
Test-NetConnection 服务器IP -Port 8080  # TcpTestSucceeded为True则正常
```

## 四、最终访问（Windows 浏览器）

输入地址：`http://服务器外网IP:8080`（如`http://154.36.185.193:8080`），输入`config.json`里的用户名密码即可访问。

## 五、关键避坑点

1. **端口映射**：Docker 默认可能把 8080 映射到 127.0.0.1，必须改成 0.0.0.0；
2. **权限问题**：logs 目录一定要开放 777 权限，否则 Freqtrade 启动失败；
3. **安全组**：入站规则必须放行 8080/TCP，这是外网访问的核心；
4. **配置文件**：Freqtrade 的`listen_addresses`必须设为 0.0.0.0，否则只允许本地访问。

## 六、终极解决方案

```bash
docker compose logs
```

打印日志，复制下来问ai