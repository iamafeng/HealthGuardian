package com.healthguardian;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import javax.annotation.PostConstruct;
import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;

@RestController
@RequestMapping("/api")
@CrossOrigin
public class ReminderController {

    @Autowired
    private JdbcTemplate jdbcTemplate;
    private final RestTemplate restTemplate = new RestTemplate();

    @PostConstruct
    public void initTables() {
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS t_partner (" +
            "  id BIGINT AUTO_INCREMENT PRIMARY KEY," +
            "  user_key VARCHAR(255) NOT NULL," +
            "  partner_key VARCHAR(255) NOT NULL," +
            "  created_at DATETIME DEFAULT NOW()," +
            "  UNIQUE KEY uk_pair (user_key, partner_key)" +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
    }

    private String hashPassword(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(password.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1)
                    hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return "";
        }
    }

    @GetMapping("/configs")
    @Transactional
    public Map<String, Object> getConfigs(@RequestParam(required = false) String secretKey,
            @RequestParam(defaultValue = "匿名用户") String username) {
        Map<String, Object> response = new HashMap<>();
        if (secretKey != null && !secretKey.isEmpty()) {
            List<Map<String, Object>> configs = jdbcTemplate
                    .queryForList("SELECT * FROM t_reminder_config WHERE secret_key = ? AND is_enabled = 1", secretKey);
            if (!configs.isEmpty()) {
                response.put("configs", configs);
                response.put("secretKey", secretKey);
                List<Map<String, Object>> userInfos = jdbcTemplate.queryForList(
                        "SELECT username, webhook_url, is_webhook_enabled FROM t_user WHERE secret_key = ?", secretKey);
                if (!userInfos.isEmpty()) {
                    response.put("username", userInfos.get(0).get("username"));
                    response.put("webhookUrl", userInfos.get(0).get("webhook_url"));
                    response.put("isWebhookEnabled", userInfos.get(0).get("is_webhook_enabled"));
                }
                // 告知前端：当前 key 是否已绑定真实账号（用于访客提醒逻辑）
                response.put("isRegistered", !userInfos.isEmpty());
                jdbcTemplate.update("UPDATE t_user SET last_active_at = NOW() WHERE secret_key = ?", secretKey);
                return response;
            }
        }
        // 访客模式：仅创建提醒配置，不写 t_user，避免多端同时打开时 key 冲突与脏数据
        String newSecretKey = UUID.randomUUID().toString();
        String generatedUsername = "访客_" + newSecretKey.substring(0, 5);
        jdbcTemplate.update(
                "INSERT INTO t_reminder_config (username, secret_key, remind_type, interval_minutes) VALUES (?, ?, 'DRINK', 45)",
                generatedUsername, newSecretKey);
        jdbcTemplate.update(
                "INSERT INTO t_reminder_config (username, secret_key, remind_type, interval_minutes) VALUES (?, ?, 'SEDENTARY', 60)",
                generatedUsername, newSecretKey);
        response.put("configs",
                jdbcTemplate.queryForList("SELECT * FROM t_reminder_config WHERE secret_key = ?", newSecretKey));
        response.put("secretKey", newSecretKey);
        response.put("username", generatedUsername); // 仅本次会话展示，不持久化到 t_user
        response.put("isRegistered", false);         // 新访客，未注册
        return response;
    }

    @GetMapping("/leaderboard")
    public List<Map<String, Object>> getLeaderboard() {
        return jdbcTemplate.queryForList(
                "SELECT u.username, COUNT(l.id) as total_score " +
                        "FROM t_user u " +
                        "JOIN t_reminder_log l ON u.secret_key = l.secret_key " +
                        "GROUP BY u.secret_key, u.username " +
                        "ORDER BY total_score DESC LIMIT 10");
    }

    @PostMapping("/complete")
    @Transactional
    public String complete(@RequestParam String type, @RequestParam String secretKey) {
        jdbcTemplate.update("INSERT INTO t_reminder_log (remind_type, secret_key) VALUES (?, ?)", type, secretKey);
        checkAchievements(secretKey, type);
        return "OK";
    }

    private void checkAchievements(String secretKey, String type) {
        LocalTime now = LocalTime.now();
        if (now.isBefore(LocalTime.of(8, 30)))
            award(secretKey, "EARLY_BIRD");
        if (now.isAfter(LocalTime.of(22, 0)))
            award(secretKey, "NIGHT_OWL");
        if ("DRINK".equals(type)) {
            Integer c = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND remind_type='DRINK' AND DATE(completed_at)=CURDATE()",
                    Integer.class, secretKey);
            if (c != null && c >= 8)
                award(secretKey, "WATER_BUFFALO");
        }
        if ("SEDENTARY".equals(type)) {
            Integer c = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND remind_type='SEDENTARY'", Integer.class,
                    secretKey);
            if (c != null && c >= 20)
                award(secretKey, "STRETCH_EXPERT");
        }
        Integer days = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT DATE(completed_at)) FROM t_reminder_log WHERE secret_key=? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)",
                Integer.class, secretKey);
        if (days != null && days >= 7)
            award(secretKey, "PERSISTENCE");
    }

    private void award(String secretKey, String code) {
        jdbcTemplate.update("INSERT IGNORE INTO t_user_achievement (secret_key, achievement_code) VALUES (?, ?)",
                secretKey, code);
    }

    @GetMapping("/stats")
    public Map<String, Object> getStats(@RequestParam String secretKey) {
        Map<String, Object> result = new HashMap<>();
        result.put("today", jdbcTemplate.queryForList(
                "SELECT remind_type, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? AND DATE(completed_at) = CURDATE() GROUP BY remind_type",
                secretKey));
        result.put("weekly", jdbcTemplate.queryForList(
                "SELECT DATE_FORMAT(completed_at, '%m-%d') as date, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) GROUP BY date ORDER BY date ASC",
                secretKey));
        result.put("hourly", jdbcTemplate.queryForList(
                "SELECT HOUR(completed_at) as hour, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? GROUP BY hour ORDER BY hour ASC",
                secretKey));

        // V3.0 HP 逻辑
        Long totalTasks = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key = ? AND DATE(completed_at) = CURDATE()",
                Long.class, secretKey);
        int currentHp = Math.min(100, 40 + (totalTasks.intValue() * 10));
        result.put("hp", currentHp);

        String[] diagnosis = {
                "机体稳定性：良好。环境温度适宜，适合进行深度专注协议。",
                "检测到轻微脱水。注意：外部环境干燥，水分消耗速度增加 20%。",
                "警告！肌肉组织出现僵直迹象，神经传输效率下降。建议启动调息指引！",
                "生命体征处于临界值！系统已锁定高能耗模块，请立即完成补给打卡！"
        };
        result.put("systemMsg", currentHp > 85 ? diagnosis[0]
                : (currentHp > 65 ? diagnosis[1] : (currentHp > 40 ? diagnosis[2] : diagnosis[3])));

        Long totalPomo = jdbcTemplate.queryForObject(
                "SELECT IFNULL(SUM(duration_minutes), 0) FROM t_pomodoro_log WHERE secret_key = ?", Long.class,
                secretKey);
        result.put("totalFocusTime", totalPomo);
        return result;
    }

    @GetMapping("/stats/heatmap")
    public List<Map<String, Object>> getHeatmap(@RequestParam String secretKey) {
        return jdbcTemplate.queryForList(
                "SELECT DATE(completed_at) as date, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) GROUP BY date ORDER BY date ASC",
                secretKey);
    }

    @GetMapping("/stats/weekly-report")
    public Map<String, Object> getWeeklyReport(@RequestParam String secretKey) {
        Map<String, Object> r = new HashMap<>();
        r.put("thisWeek", jdbcTemplate.queryForList(
                "SELECT remind_type, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY remind_type",
                secretKey));
        r.put("lastWeek", jdbcTemplate.queryForList(
                "SELECT remind_type, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) AND completed_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY remind_type",
                secretKey));
        r.put("thisWeekDaily", jdbcTemplate.queryForList(
                "SELECT DATE_FORMAT(completed_at, '%m-%d') as date, COUNT(*) as count FROM t_reminder_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY date ORDER BY date",
                secretKey));
        r.put("focusThisWeek", jdbcTemplate.queryForObject(
                "SELECT IFNULL(SUM(duration_minutes), 0) FROM t_pomodoro_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)",
                Long.class, secretKey));
        r.put("focusLastWeek", jdbcTemplate.queryForObject(
                "SELECT IFNULL(SUM(duration_minutes), 0) FROM t_pomodoro_log WHERE secret_key = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) AND completed_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY)",
                Long.class, secretKey));
        return r;
    }

    @GetMapping("/streak")
    public Map<String, Object> getStreak(@RequestParam String secretKey) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> dates = jdbcTemplate.queryForList(
                "SELECT DISTINCT DATE(completed_at) as log_date FROM t_reminder_log WHERE secret_key = ? ORDER BY log_date DESC",
                secretKey);
        int streak = 0;
        LocalDate checkDate = LocalDate.now();
        Set<String> dateSet = new HashSet<>();
        for (Map<String, Object> row : dates) {
            dateSet.add(row.get("log_date").toString());
        }
        // 如果今天还没打卡，从昨天开始算连续
        if (!dateSet.contains(checkDate.toString())) {
            checkDate = checkDate.minusDays(1);
        }
        while (dateSet.contains(checkDate.toString())) {
            streak++;
            checkDate = checkDate.minusDays(1);
        }
        result.put("streak", streak);
        result.put("todayDone", dateSet.contains(LocalDate.now().toString()));
        return result;
    }

    @PostMapping("/user/auth")
    @Transactional
    public Map<String, Object> unifiedAuth(@RequestParam String username, @RequestParam String password,
            @RequestParam(required = false) String currentKey) {
        Map<String, Object> response = new HashMap<>();
        String pwdHash = hashPassword(password);

        // 1. 查询用户名是否已存在（自动判断 "登录召回" 还是 "新建绑定"）
        List<Map<String, Object>> existingUsers = jdbcTemplate.queryForList(
                "SELECT secret_key, password_hash FROM t_user WHERE username = ?", username);

        if (!existingUsers.isEmpty()) {
            // ── 用户名已存在 → 自动进入「登录召回」模式 ──
            String storedHash = (String) existingUsers.get(0).get("password_hash");
            if (!pwdHash.equals(storedHash)) {
                response.put("success", false);
                response.put("msg", "该账号已存在，密码不匹配");
                return response;
            }
            String accountKey = (String) existingUsers.get(0).get("secret_key");
            // 迁移当前访客临时数据到正式账号
            if (currentKey != null && !currentKey.isEmpty() && !currentKey.equals(accountKey)) {
                jdbcTemplate.update("UPDATE t_reminder_log SET secret_key = ? WHERE secret_key = ?", accountKey, currentKey);
                jdbcTemplate.update("UPDATE t_user_achievement SET secret_key = ? WHERE secret_key = ?", accountKey, currentKey);
                jdbcTemplate.update("UPDATE t_pomodoro_log SET secret_key = ? WHERE secret_key = ?", accountKey, currentKey);
                jdbcTemplate.update("DELETE FROM t_reminder_config WHERE secret_key = ?", currentKey);
                jdbcTemplate.update("DELETE FROM t_user WHERE secret_key = ? AND password_hash = ''", currentKey);
            }
            jdbcTemplate.update("UPDATE t_user SET last_active_at = NOW() WHERE secret_key = ?", accountKey);
            response.put("success", true);
            response.put("secretKey", accountKey);
            response.put("msg", "身份召回成功，数据已同步");
            return response;
        }

        // ── 用户名不存在 → 自动进入「新建绑定」模式 ──
        String secretKey = (currentKey != null && !currentKey.isEmpty()) ? currentKey : UUID.randomUUID().toString();
        try {
            List<Map<String, Object>> existingByKey = jdbcTemplate.queryForList(
                    "SELECT id FROM t_user WHERE secret_key = ?", secretKey);
            if (existingByKey.isEmpty()) {
                jdbcTemplate.update(
                        "INSERT INTO t_user (username, password_hash, secret_key, last_active_at) VALUES (?, ?, ?, NOW())",
                        username, pwdHash, secretKey);
            } else {
                jdbcTemplate.update(
                        "UPDATE t_user SET username = ?, password_hash = ?, last_active_at = NOW() WHERE secret_key = ?",
                        username, pwdHash, secretKey);
            }
            jdbcTemplate.update("UPDATE t_reminder_config SET username = ? WHERE secret_key = ?", username, secretKey);
            award(secretKey, "COMMUNITY_STAR");
            response.put("success", true);
            response.put("secretKey", secretKey);
            response.put("msg", "新身份创建成功");
            return response;
        } catch (Exception e) {
            response.put("success", false);
            response.put("msg", "操作失败，请重试");
            return response;
        }
    }

    // 保留旧接口向后兼容
    @PostMapping("/user/bind")
    @Transactional
    public String bindAccount(@RequestParam String username, @RequestParam String password,
            @RequestParam String secretKey) {
        String pwdHash = hashPassword(password);
        try {
            // 判断是访客（无 t_user 记录）还是已有账号（重新绑定）
            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                    "SELECT id FROM t_user WHERE secret_key = ?", secretKey);
            if (existing.isEmpty()) {
                // 访客首次绑定：INSERT 新用户行
                jdbcTemplate.update(
                        "INSERT INTO t_user (username, password_hash, secret_key, last_active_at) VALUES (?, ?, ?, NOW())",
                        username, pwdHash, secretKey);
            } else {
                // 已有账号：UPDATE（修改用户名/密码）
                jdbcTemplate.update(
                        "UPDATE t_user SET username = ?, password_hash = ?, last_active_at = NOW() WHERE secret_key = ?",
                        username, pwdHash, secretKey);
            }
            jdbcTemplate.update("UPDATE t_reminder_config SET username = ? WHERE secret_key = ?", username, secretKey);
            award(secretKey, "COMMUNITY_STAR");
            return "绑定成功";
        } catch (Exception e) {
            return "账户名称已存在";
        }
    }

    @GetMapping("/user/login")
    @Transactional
    public Map<String, Object> login(@RequestParam String username, @RequestParam String password,
            @RequestParam(required = false) String currentTempKey) {
        Map<String, Object> response = new HashMap<>();
        String pwdHash = hashPassword(password);
        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT secret_key FROM t_user WHERE username = ? AND password_hash = ?", username, pwdHash);
        if (users.isEmpty()) {
            response.put("success", false);
            response.put("msg", "密码错误信息");
            return response;
        }
        String accountKey = (String) users.get(0).get("secret_key");
        if (currentTempKey != null && !currentTempKey.equals(accountKey)) {
            jdbcTemplate.update("UPDATE t_reminder_log SET secret_key = ? WHERE secret_key = ?", accountKey,
                    currentTempKey);
            jdbcTemplate.update("UPDATE t_user_achievement SET secret_key = ? WHERE secret_key = ?", accountKey,
                    currentTempKey);
            jdbcTemplate.update("UPDATE t_pomodoro_log SET secret_key = ? WHERE secret_key = ?", accountKey,
                    currentTempKey);
            jdbcTemplate.update("DELETE FROM t_reminder_config WHERE secret_key = ?", currentTempKey);
            // 兼容存量数据：如果访客 temp key 在 t_user 里有残留行（旧版本创建），一并清除
            jdbcTemplate.update("DELETE FROM t_user WHERE secret_key = ? AND password_hash = ''", currentTempKey);
        }
        response.put("success", true);
        response.put("secretKey", accountKey);
        return response;
    }

    @PostMapping("/user/webhook")
    public String updateWebhook(@RequestParam String secretKey, @RequestParam String webhookUrl,
            @RequestParam Integer enabled) {
        jdbcTemplate.update("UPDATE t_user SET webhook_url = ?, is_webhook_enabled = ? WHERE secret_key = ?",
                webhookUrl, enabled, secretKey);
        return "OK";
    }

    @GetMapping("/user/achievements")
    public List<Map<String, Object>> getUserAchievements(@RequestParam String secretKey) {
        return jdbcTemplate.queryForList(
                "SELECT a.*, (CASE WHEN ua.secret_key IS NOT NULL THEN 1 ELSE 0 END) as is_achieved FROM t_achievement a LEFT JOIN t_user_achievement ua ON a.code = ua.achievement_code AND ua.secret_key = ?",
                secretKey);
    }

    @PostMapping("/pomodoro/complete")
    public String completePomodoro(@RequestParam String secretKey,
            @RequestParam(defaultValue = "25") Integer duration) {
        jdbcTemplate.update("INSERT INTO t_pomodoro_log (secret_key, duration_minutes) VALUES (?, ?)", secretKey,
                duration);
        Integer c = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM t_pomodoro_log WHERE secret_key = ?",
                Integer.class, secretKey);
        if (c != null && c >= 5)
            award(secretKey, "FOCUS_MASTER");
        if (c != null && c >= 10)
            award(secretKey, "PRODUCTIVITY_BEAST");
        return "OK";
    }

    @PostMapping("/notify/webhook")
    public String sendWebhook(@RequestParam String secretKey, @RequestParam String message) {
        try {
            List<Map<String, Object>> users = jdbcTemplate
                    .queryForList("SELECT webhook_url, is_webhook_enabled FROM t_user WHERE secret_key = ?", secretKey);
            if (!users.isEmpty()) {
                Object enabledObj = users.get(0).get("is_webhook_enabled");
                boolean isEnabled = false;
                if (enabledObj instanceof Boolean) {
                    isEnabled = (Boolean) enabledObj;
                } else if (enabledObj instanceof Number) {
                    isEnabled = ((Number) enabledObj).intValue() == 1;
                }

                if (isEnabled) {
                    String url = (String) users.get(0).get("webhook_url");
                    if (url != null && !url.isEmpty()) {
                        HttpHeaders h = new HttpHeaders();
                        h.setContentType(MediaType.APPLICATION_JSON);
                        Map<String, Object> b = new HashMap<>();
                        b.put("msgtype", "text");
                        Map<String, String> t = new HashMap<>();
                        t.put("content", "[Health] " + message);
                        b.put("text", t);
                        restTemplate.postForEntity(url, new HttpEntity<>(b, h), String.class);
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace(); // 打印错误日志，方便排查 Webhook 发送失败原因
        }
        return "OK";
    }

    @PostMapping("/configs/update")
    public String updateConfig(@RequestParam String secretKey, @RequestParam String type,
            @RequestParam Integer minutes) {
        jdbcTemplate.update(
                "UPDATE t_reminder_config SET interval_minutes = ? WHERE secret_key = ? AND remind_type = ?", minutes,
                secretKey, type);
        return "OK";
    }

    // ─── 🤖 AI 健康日报 ────────────────────────────────────────────────────────
    @GetMapping("/daily-brief")
    public Map<String, Object> getDailyBrief(@RequestParam String secretKey) {
        Map<String, Object> result = new HashMap<>();
        // 昨日打卡
        List<Map<String, Object>> yday = jdbcTemplate.queryForList(
                "SELECT remind_type, COUNT(*) as count FROM t_reminder_log WHERE secret_key=? AND DATE(completed_at)=DATE_SUB(CURDATE(),INTERVAL 1 DAY) GROUP BY remind_type",
                secretKey);
        // 连续天数
        Map<String, Object> streakData = getStreak(secretKey);
        // 累计打卡天数
        Integer totalDays = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT DATE(completed_at)) FROM t_reminder_log WHERE secret_key=?",
                Integer.class, secretKey);
        // 最活跃小时
        List<Map<String, Object>> bestHourList = jdbcTemplate.queryForList(
                "SELECT HOUR(completed_at) as hour, COUNT(*) as cnt FROM t_reminder_log WHERE secret_key=? GROUP BY hour ORDER BY cnt DESC LIMIT 1",
                secretKey);
        // 今日已打卡次数
        Integer todayCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND DATE(completed_at)=CURDATE()",
                Integer.class, secretKey);
        result.put("yesterdayStats", yday);
        result.put("streak", streakData.get("streak"));
        result.put("todayDone", streakData.get("todayDone"));
        result.put("totalDays", totalDays != null ? totalDays : 0);
        result.put("bestHour", bestHourList.isEmpty() ? null : bestHourList.get(0).get("hour"));
        result.put("todayCount", todayCount != null ? todayCount : 0);
        return result;
    }

    // ─── 👫 健康搭子 ────────────────────────────────────────────────────────────
    @GetMapping("/partner/my-code")
    public Map<String, Object> getMyPartnerCode(@RequestParam String secretKey) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> user = jdbcTemplate.queryForList(
                "SELECT username FROM t_user WHERE secret_key=?", secretKey);
        if (user.isEmpty()) {
            result.put("isRegistered", false);
            result.put("code", null);
        } else {
            result.put("isRegistered", true);
            result.put("code", user.get(0).get("username"));
        }
        List<Map<String, Object>> partners = jdbcTemplate.queryForList(
                "SELECT u.username, p.partner_key FROM t_partner p LEFT JOIN t_user u ON u.secret_key=p.partner_key WHERE p.user_key=?",
                secretKey);
        result.put("partners", partners);
        return result;
    }

    @PostMapping("/partner/bind")
    @Transactional
    public Map<String, Object> bindPartner(@RequestParam String myKey, @RequestParam String inviteCode) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> partnerUsers = jdbcTemplate.queryForList(
                "SELECT secret_key, username FROM t_user WHERE username=?", inviteCode.trim());
        if (partnerUsers.isEmpty()) {
            result.put("success", false);
            result.put("msg", "未找到该邀请码对应的用户，请确认对方已注册账号");
            return result;
        }
        String partnerKey = (String) partnerUsers.get(0).get("secret_key");
        if (partnerKey.equals(myKey)) {
            result.put("success", false);
            result.put("msg", "不能和自己做搭子哦 😄");
            return result;
        }
        try {
            jdbcTemplate.update("INSERT IGNORE INTO t_partner (user_key, partner_key) VALUES (?,?)", myKey, partnerKey);
            jdbcTemplate.update("INSERT IGNORE INTO t_partner (user_key, partner_key) VALUES (?,?)", partnerKey, myKey);
            result.put("success", true);
            result.put("partnerName", partnerUsers.get(0).get("username"));
            result.put("msg", "搭子绑定成功！互相监督，共同进步！🎉");
        } catch (Exception e) {
            result.put("success", false);
            result.put("msg", "绑定失败，请重试");
        }
        return result;
    }

    @GetMapping("/partner/stats")
    public List<Map<String, Object>> getPartnerStats(@RequestParam String myKey) {
        return jdbcTemplate.queryForList(
                "SELECT u.username, p.partner_key," +
                " (SELECT COUNT(*) FROM t_reminder_log rl WHERE rl.secret_key=p.partner_key AND DATE(rl.completed_at)=CURDATE() AND rl.remind_type='DRINK') as drink_count," +
                " (SELECT COUNT(*) FROM t_reminder_log rl WHERE rl.secret_key=p.partner_key AND DATE(rl.completed_at)=CURDATE() AND rl.remind_type='SEDENTARY') as rest_count," +
                " (SELECT COUNT(DISTINCT DATE(rl.completed_at)) FROM t_reminder_log rl WHERE rl.secret_key=p.partner_key AND rl.completed_at >= DATE_SUB(CURDATE(),INTERVAL 6 DAY)) as week_days" +
                " FROM t_partner p JOIN t_user u ON u.secret_key=p.partner_key WHERE p.user_key=?",
                myKey);
    }

    @PostMapping("/partner/unbind")
    public String unbindPartner(@RequestParam String myKey, @RequestParam String partnerKey) {
        jdbcTemplate.update("DELETE FROM t_partner WHERE (user_key=? AND partner_key=?) OR (user_key=? AND partner_key=?)",
                myKey, partnerKey, partnerKey, myKey);
        return "OK";
    }

    // ─── ⚡ 智能提醒自适应 ────────────────────────────────────────────────────────
    @GetMapping("/adaptive-schedule")
    public Map<String, Object> getAdaptiveSchedule(@RequestParam String secretKey) {
        Map<String, Object> result = new HashMap<>();
        Integer totalCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=?", Integer.class, secretKey);
        if (totalCount == null || totalCount < 10) {
            result.put("hasData", false);
            result.put("msg", "数据不足（当前 " + (totalCount == null ? 0 : totalCount) + " 条），至少需要 10 次打卡记录才能分析规律");
            return result;
        }
        // 平均补水间隔
        List<Map<String, Object>> drinkGap = jdbcTemplate.queryForList(
                "SELECT ROUND(AVG(gap)) as avg_gap FROM (SELECT TIMESTAMPDIFF(MINUTE, LAG(completed_at) OVER (PARTITION BY remind_type ORDER BY completed_at), completed_at) as gap FROM t_reminder_log WHERE secret_key=? AND remind_type='DRINK') t WHERE gap BETWEEN 15 AND 300",
                secretKey);
        // 平均久坐间隔
        List<Map<String, Object>> restGap = jdbcTemplate.queryForList(
                "SELECT ROUND(AVG(gap)) as avg_gap FROM (SELECT TIMESTAMPDIFF(MINUTE, LAG(completed_at) OVER (PARTITION BY remind_type ORDER BY completed_at), completed_at) as gap FROM t_reminder_log WHERE secret_key=? AND remind_type='SEDENTARY') t WHERE gap BETWEEN 15 AND 300",
                secretKey);
        // 最活跃时段 Top 5
        List<Map<String, Object>> activeHours = jdbcTemplate.queryForList(
                "SELECT HOUR(completed_at) as hour, COUNT(*) as cnt FROM t_reminder_log WHERE secret_key=? GROUP BY hour ORDER BY cnt DESC LIMIT 5",
                secretKey);
        // 响应率：今日提醒 vs 总应打卡（粗估）
        Long completedToday = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND DATE(completed_at)=CURDATE()", Long.class, secretKey);
        result.put("hasData", true);
        result.put("totalCount", totalCount);
        result.put("drinkAvgGap", drinkGap.isEmpty() ? null : drinkGap.get(0).get("avg_gap"));
        result.put("restAvgGap", restGap.isEmpty() ? null : restGap.get(0).get("avg_gap"));
        result.put("activeHours", activeHours);
        result.put("completedToday", completedToday);
        return result;
    }
}
