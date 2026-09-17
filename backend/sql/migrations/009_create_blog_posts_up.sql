-- 009_create_blog_posts (UP)
-- Scheduling needs no cron job: a post with status='published' and a
-- future published_at simply isn't visible yet — public queries filter
-- `status = 'published' AND published_at <= NOW()`. Setting published_at
-- to a past/current timestamp publishes it immediately.
USE shope_clothes;

CREATE TABLE blog_posts (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(200)    NOT NULL,
    slug            VARCHAR(220)    NOT NULL UNIQUE,
    excerpt         VARCHAR(500)    NULL,
    body_markdown   MEDIUMTEXT      NOT NULL,
    cover_image     VARCHAR(500)    NULL,
    status          ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    published_at    DATETIME        NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_posts_status_published (status, published_at)
) ENGINE=InnoDB;
