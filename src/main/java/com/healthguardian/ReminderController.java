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

    private static final Map<String, Integer> CAT_PRICES = new HashMap<String, Integer>() {{
        put("cat_OrangeTabby",          0);
        put("cat_Bengal",             100);
        put("cat_Calico",             100);
        put("cat_Tuxedo",             150);
        put("cat_BlackCat",           150);
        put("cat_BritishShorthair-Blue", 200);
        put("cat_Ragdoll",            250);
        put("cat_MaineCoon",          300);
        put("cat_Sphynx",             500);
    }};

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
        // 初始化成就基础数据（全量幂等插入，含隐藏成就）
        String[][] achievements = {
            {"EARLY_BIRD",         "早起鸟",       "08:30 前开启今日首个协议",                    "0"},
            {"NIGHT_OWL",          "夜猫子",       "22:00 后依然在执行协议",                       "0"},
            {"WATER_BUFFALO",      "大水牛",       "单日生物补给达到 8 次",                        "0"},
            {"PERSISTENCE",        "不倒翁",       "连续 7 天坚持监控生命体征",                     "0"},
            {"FOCUS_MASTER",       "专注达人",     "累计完成 5 次深度专注协议",                     "0"},
            {"PRODUCTIVITY_BEAST", "效率怪兽",     "累计完成 10 次专注协议",                       "0"},
            {"STRETCH_EXPERT",     "拉伸达人",     "累计完成 20 次调息指引",                       "0"},
            {"COMMUNITY_STAR",     "系统公民",     "成功建立加密账号身份",                         "0"},
            // 隐藏成就
            {"MIDNIGHT_GHOST",     "午夜幽灵",     "🔒 隐藏成就：在深夜 00:00-04:00 完成打卡",     "1"},
            {"HYDRO_CHAMPION",     "补水冠军",     "🔒 隐藏成就：单日补给达到 10 次",             "1"},
            {"DAWN_WARRIOR",       "黎明战士",     "🔒 隐藏成就：07:00 前完成今日首次打卡",        "1"},
            {"PET_LOVER",          "宠物达人",     "🔒 隐藏成就：通过小怪兽喂水 5 次",            "1"},
        };
        for (String[] a : achievements) {
            jdbcTemplate.update(
                "INSERT IGNORE INTO t_achievement (code, name, description) VALUES (?, ?, ?)",
                a[0], a[1], a[2]);
            // 添加 is_hidden 字段（如果不存在）
        }
        // 尝试添加 is_hidden 字段（忽略错误，字段可能已存在）
        try {
            jdbcTemplate.execute(
                "ALTER TABLE t_achievement ADD COLUMN IF NOT EXISTS is_hidden TINYINT(1) DEFAULT 0 COMMENT '是否隐藏成就'");
        } catch (Exception ignored) {}
        // 更新隐藏标记
        String[] hiddenCodes = {"MIDNIGHT_GHOST", "HYDRO_CHAMPION", "DAWN_WARRIOR", "PET_LOVER"};
        for (String code : hiddenCodes) {
            try {
                jdbcTemplate.update("UPDATE t_achievement SET is_hidden=1 WHERE code=?", code);
            } catch (Exception ignored) {}
        }

        // 新增 coins 字段（小鱼干币）
        try {
            jdbcTemplate.execute(
                "ALTER TABLE t_user ADD COLUMN IF NOT EXISTS coins INT DEFAULT 0 COMMENT '小鱼干币'");
        } catch (Exception ignored) {}

        // 新增 selected_cat 字段（当前选中的猫咪品种）
        try {
            jdbcTemplate.execute(
                "ALTER TABLE t_user ADD COLUMN IF NOT EXISTS selected_cat VARCHAR(50) DEFAULT 'cat_OrangeTabby' COMMENT '当前猫咪'");
        } catch (Exception ignored) {}

        // 新增 unlocked_cats 字段（已解锁猫咪，逗号分隔）
        try {
            jdbcTemplate.execute(
                "ALTER TABLE t_user ADD COLUMN IF NOT EXISTS unlocked_cats TEXT DEFAULT 'cat_OrangeTabby' COMMENT '已解锁猫咪'");
        } catch (Exception ignored) {}
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
            
            List<Map<String, Object>> userInfos = jdbcTemplate.queryForList(
                    "SELECT username, webhook_url, is_webhook_enabled, coins, selected_cat, unlocked_cats FROM t_user WHERE secret_key = ?", secretKey);

            if (!configs.isEmpty() || !userInfos.isEmpty()) {
                // 如果配置不存在但用户存在，可能是从其他端同步过来的新账号，需要初始化默认配置
                if (configs.isEmpty() && !userInfos.isEmpty()) {
                    String actualUsername = (String) userInfos.get(0).get("username");
                    jdbcTemplate.update(
                            "INSERT INTO t_reminder_config (username, secret_key, remind_type, interval_minutes) VALUES (?, ?, 'DRINK', 45)",
                            actualUsername, secretKey);
                    jdbcTemplate.update(
                            "INSERT INTO t_reminder_config (username, secret_key, remind_type, interval_minutes) VALUES (?, ?, 'SEDENTARY', 60)",
                            actualUsername, secretKey);
                    configs = jdbcTemplate.queryForList("SELECT * FROM t_reminder_config WHERE secret_key = ? AND is_enabled = 1", secretKey);
                }

                response.put("configs", configs);
                response.put("secretKey", secretKey);
                if (!userInfos.isEmpty()) {
                    response.put("username", userInfos.get(0).get("username"));
                    response.put("webhookUrl", userInfos.get(0).get("webhook_url"));
                    response.put("isWebhookEnabled", userInfos.get(0).get("is_webhook_enabled"));
                }
                // 告知前端：当前 key 是否已绑定真实账号（用于访客提醒逻辑）
                response.put("isRegistered", !userInfos.isEmpty() && !((String)userInfos.get(0).get("username")).startsWith("访客_"));
                if (!userInfos.isEmpty()) {
                    response.put("coins", userInfos.get(0).getOrDefault("coins", 0));
                    response.put("selectedCat", userInfos.get(0).getOrDefault("selected_cat", "cat_OrangeTabby"));
                    response.put("unlockedCats", userInfos.get(0).getOrDefault("unlocked_cats", "cat_OrangeTabby"));
                }
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
        // 标准成就
        if (now.isBefore(LocalTime.of(8, 30)))
            award(secretKey, "EARLY_BIRD");
        if (now.isAfter(LocalTime.of(22, 0)))
            award(secretKey, "NIGHT_OWL");
        // 🔒 隐藏：午夜幽灵
        if (now.isBefore(LocalTime.of(4, 0)))
            award(secretKey, "MIDNIGHT_GHOST");
        // 🔒 隐藏：黎明战士（07:00 前首次打卡）
        if (now.isBefore(LocalTime.of(7, 0))) {
            Integer todayFirst = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND DATE(completed_at)=CURDATE()",
                Integer.class, secretKey);
            if (todayFirst != null && todayFirst == 1) award(secretKey, "DAWN_WARRIOR");
        }
        if ("DRINK".equals(type)) {
            Integer c = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND remind_type='DRINK' AND DATE(completed_at)=CURDATE()",
                    Integer.class, secretKey);
            if (c != null && c >= 8)
                award(secretKey, "WATER_BUFFALO");
            // 🔒 隐藏：补水冠军
            if (c != null && c >= 10)
                award(secretKey, "HYDRO_CHAMPION");
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
            if (storedHash != null && !storedHash.isEmpty() && !pwdHash.equals(storedHash)) {
                response.put("success", false);
                response.put("msg", "该账号已存在，密码不匹配");
                return response;
            }
            String accountKey = (String) existingUsers.get(0).get("secret_key");
            
            // 如果该账号之前没有密码（比如旧版本的访客账号），现在设置密码
            if (storedHash == null || storedHash.isEmpty()) {
                jdbcTemplate.update("UPDATE t_user SET password_hash = ? WHERE secret_key = ?", pwdHash, accountKey);
            }

            // 迁移当前访客临时数据到正式账号
            if (currentKey != null && !currentKey.isEmpty() && !currentKey.equals(accountKey)) {
                // 检查是否有重复记录，避免唯一约束冲突（针对 log 和 achievement 等）
                jdbcTemplate.update("UPDATE IGNORE t_reminder_log SET secret_key = ? WHERE secret_key = ?", accountKey, currentKey);
                jdbcTemplate.update("UPDATE IGNORE t_user_achievement SET secret_key = ? WHERE secret_key = ?", accountKey, currentKey);
                jdbcTemplate.update("UPDATE IGNORE t_pomodoro_log SET secret_key = ? WHERE secret_key = ?", accountKey, currentKey);
                
                // 迁移搭子关系
                jdbcTemplate.update("UPDATE IGNORE t_partner SET user_key = ? WHERE user_key = ?", accountKey, currentKey);
                jdbcTemplate.update("UPDATE IGNORE t_partner SET partner_key = ? WHERE partner_key = ?", accountKey, currentKey);

                // 如果正式账号没有配置，则同步访客配置；如果有，则删除访客配置
                List<Map<String, Object>> accountConfigs = jdbcTemplate.queryForList("SELECT id FROM t_reminder_config WHERE secret_key = ?", accountKey);
                if (accountConfigs.isEmpty()) {
                    jdbcTemplate.update("UPDATE t_reminder_config SET secret_key = ?, username = ? WHERE secret_key = ?", accountKey, username, currentKey);
                } else {
                    jdbcTemplate.update("DELETE FROM t_reminder_config WHERE secret_key = ?", currentKey);
                }
                
                // 删除旧的访客用户记录（如果有）
                jdbcTemplate.update("DELETE FROM t_user WHERE secret_key = ? AND (password_hash = '' OR password_hash IS NULL)", currentKey);
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
    public String updateWebhook(@RequestParam String secretKey,
            @RequestParam String webhookUrl,
            @RequestParam Integer enabled,
            @RequestParam(required = false, defaultValue = "1")      Integer quietEnabled,
            @RequestParam(required = false, defaultValue = "21:00")  String quietStart,
            @RequestParam(required = false, defaultValue = "07:00")  String quietEnd) {
        jdbcTemplate.update(
            "UPDATE t_user SET webhook_url=?, is_webhook_enabled=?, quiet_enabled=?, quiet_start=?, quiet_end=? WHERE secret_key=?",
            webhookUrl, enabled, quietEnabled, quietStart, quietEnd, secretKey);
        return "OK";
    }

    @GetMapping("/user/achievements")
    public List<Map<String, Object>> getUserAchievements(@RequestParam String secretKey) {
        return jdbcTemplate.queryForList(
                "SELECT a.*, COALESCE(a.is_hidden, 0) as is_hidden, " +
                "(CASE WHEN ua.secret_key IS NOT NULL THEN 1 ELSE 0 END) as is_achieved " +
                "FROM t_achievement a LEFT JOIN t_user_achievement ua " +
                "ON a.code = ua.achievement_code AND ua.secret_key = ?",
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
        // 发放小鱼干币（仅注册用户，忽略访客）
        try {
            jdbcTemplate.update(
                "UPDATE t_user SET coins = coins + 10 WHERE secret_key=?", secretKey);
        } catch (Exception ignored) {}
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

    // ─── 👫 搭子提醒（一键电击）────────────────────────────────────────────────
    @PostMapping("/partner/nudge")
    public Map<String, Object> nudgePartner(@RequestParam String myKey, @RequestParam String partnerKey) {
        Map<String, Object> result = new HashMap<>();
        try {
            // 获取自己的用户名
            List<Map<String, Object>> myInfo = jdbcTemplate.queryForList(
                    "SELECT username FROM t_user WHERE secret_key=?", myKey);
            // 获取搭子的 webhook
            List<Map<String, Object>> partnerInfo = jdbcTemplate.queryForList(
                    "SELECT username, webhook_url, is_webhook_enabled FROM t_user WHERE secret_key=?", partnerKey);
            if (partnerInfo.isEmpty()) {
                result.put("success", false); result.put("msg", "搭子信息未找到");
                return result;
            }
            String myName = myInfo.isEmpty() ? "你的搭子" : (String) myInfo.get(0).get("username");
            String partnerName = (String) partnerInfo.get(0).get("username");
            Object enabledObj = partnerInfo.get(0).get("is_webhook_enabled");
            boolean webhookEnabled = enabledObj instanceof Number && ((Number) enabledObj).intValue() == 1;
            String webhookUrl = (String) partnerInfo.get(0).get("webhook_url");
            if (webhookEnabled && webhookUrl != null && !webhookUrl.isEmpty()) {
                HttpHeaders h = new HttpHeaders();
                h.setContentType(MediaType.APPLICATION_JSON);
                Map<String, Object> b = new HashMap<>();
                b.put("msgtype", "text");
                Map<String, String> t = new HashMap<>();
                t.put("content", String.format("⚡【搭子督促】%s 发现你好久没打卡了！快起来动一动，别让你的小怪兽饿坏了！💪", myName));
                b.put("text", t);
                restTemplate.postForEntity(webhookUrl, new HttpEntity<>(b, h), String.class);
            }
            result.put("success", true);
            result.put("msg", "已成功向 " + partnerName + " 发出电击提醒！⚡");
        } catch (Exception e) {
            result.put("success", true);
            result.put("msg", "提醒已发出（对方可能未设置 Webhook）");
        }
        return result;
    }

    // ─── 🐾 宠物喂食成就触发 ────────────────────────────────────────────────────
    @PostMapping("/pet/feed")
    public String petFeed(@RequestParam String secretKey) {
        // 统计通过宠物喂食的次数（使用 pet_feed 类型的 log）
        jdbcTemplate.update("INSERT INTO t_reminder_log (remind_type, secret_key) VALUES ('PET_FEED', ?)", secretKey);
        Integer c = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM t_reminder_log WHERE secret_key=? AND remind_type='PET_FEED'",
                Integer.class, secretKey);
        if (c != null && c >= 5) award(secretKey, "PET_LOVER");
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

    // ─── 🐟 宠物经济系统 ────────────────────────────────────────────────────────
    @GetMapping("/pet/coins")
    public Map<String, Object> getPetCoins(@RequestParam String secretKey) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT coins, selected_cat, unlocked_cats FROM t_user WHERE secret_key=?", secretKey);
        if (rows.isEmpty()) {
            result.put("coins", 0);
            result.put("selectedCat", "cat_OrangeTabby");
            result.put("unlockedCats", "cat_OrangeTabby");
        } else {
            result.put("coins", rows.get(0).get("coins"));
            result.put("selectedCat", rows.get(0).get("selected_cat"));
            result.put("unlockedCats", rows.get(0).get("unlocked_cats"));
        }
        return result;
    }

    @PostMapping("/pet/earn-coins")
    public Map<String, Object> earnCoins(@RequestParam String secretKey,
                                          @RequestParam(defaultValue = "10") Integer amount) {
        Map<String, Object> result = new HashMap<>();
        int updated = jdbcTemplate.update(
            "UPDATE t_user SET coins = coins + ? WHERE secret_key=?", amount, secretKey);
        if (updated == 0) {
            result.put("success", false); result.put("msg", "用户不存在（访客不支持）");
            return result;
        }
        Integer newCoins = jdbcTemplate.queryForObject(
            "SELECT coins FROM t_user WHERE secret_key=?", Integer.class, secretKey);
        result.put("success", true);
        result.put("coins", newCoins);
        return result;
    }

    @PostMapping("/pet/buy-cat")
    @Transactional
    public Map<String, Object> buyCat(@RequestParam String secretKey,
                                       @RequestParam String catId) {
        Map<String, Object> result = new HashMap<>();
        Integer price = CAT_PRICES.get(catId);
        if (price == null) {
            result.put("success", false); result.put("msg", "未知猫咪品种");
            return result;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT coins, unlocked_cats FROM t_user WHERE secret_key=?", secretKey);
        if (rows.isEmpty()) {
            result.put("success", false); result.put("msg", "访客不支持购买");
            return result;
        }
        int coins = ((Number) rows.get(0).get("coins")).intValue();
        String unlocked = (String) rows.get(0).get("unlocked_cats");
        if (unlocked != null && unlocked.contains(catId)) {
            result.put("success", false); result.put("msg", "已拥有该猫咪");
            return result;
        }
        if (coins < price) {
            result.put("success", false); result.put("msg", "小鱼干币不足");
            result.put("need", price); result.put("have", coins);
            return result;
        }
        String newUnlocked = (unlocked == null || unlocked.isEmpty()) ? catId : unlocked + "," + catId;
        jdbcTemplate.update(
            "UPDATE t_user SET coins = coins - ?, unlocked_cats = ? WHERE secret_key=?",
            price, newUnlocked, secretKey);
        result.put("success", true);
        result.put("coins", coins - price);
        result.put("unlockedCats", newUnlocked);
        return result;
    }

    @PostMapping("/pet/select-cat")
    public Map<String, Object> selectCat(@RequestParam String secretKey,
                                          @RequestParam String catId) {
        Map<String, Object> result = new HashMap<>();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT unlocked_cats FROM t_user WHERE secret_key=?", secretKey);
        if (rows.isEmpty()) {
            result.put("success", false); result.put("msg", "访客不支持");
            return result;
        }
        String unlocked = (String) rows.get(0).get("unlocked_cats");
        if (unlocked == null || !unlocked.contains(catId)) {
            result.put("success", false); result.put("msg", "尚未解锁该猫咪");
            return result;
        }
        jdbcTemplate.update("UPDATE t_user SET selected_cat=? WHERE secret_key=?", catId, secretKey);
        result.put("success", true);
        return result;
    }
}
