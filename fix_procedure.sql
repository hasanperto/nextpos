USE public;
DROP PROCEDURE IF EXISTS create_new_tenant_db;
DELIMITER //
CREATE PROCEDURE create_new_tenant_db(IN tenant_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)
BEGIN
    DECLARE s_name VARCHAR(255);
    SELECT schema_name INTO s_name FROM tenants WHERE id = tenant_id;
    IF s_name IS NOT NULL THEN
        SET @sql = CONCAT('CREATE DATABASE IF NOT EXISTS `', s_name, '`');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;
