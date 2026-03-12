package com.healthguardian;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 这是程序的启动入口
 * @SpringBootApplication 这个注解非常神奇，它告诉 Java：这里是一个 Spring Boot 程序的起点，请自动帮我加载所有的配置。
 */
@SpringBootApplication
public class HealthGuardianApplication {
    public static void main(String[] args) {
        // 这行代码就像按下电源开关，它会启动一个内置的小型服务器（Tomcat），让你的程序能通过浏览器访问。
        org.springframework.context.ApplicationContext context = SpringApplication.run(HealthGuardianApplication.class, args);
        //下面的端口号使用：server.port 变量
        String port = context.getEnvironment().getProperty("server.port", "8080");
        System.out.println("健康管家已启动！快去浏览器访问 http://localhost:" + port + " 来看看吧！");
    }
}
