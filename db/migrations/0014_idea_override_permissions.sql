DROP TRIGGER locked_ideas_update;

CREATE TRIGGER locked_ideas_update BEFORE UPDATE ON ideas WHEN EXISTS(SELECT 1 FROM team_locks WHERE team_id=NEW.team_id OR team_id=OLD.team_id) AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-idea:'||NEW.team_id) BEGIN SELECT RAISE(ABORT,'TEAM_LOCKED'); END;

DROP TRIGGER idea_lock;

CREATE TRIGGER idea_lock BEFORE UPDATE ON ideas WHEN (NEW.title<>OLD.title OR NEW.core<>OLD.core) AND NEW.updated_at >= (SELECT json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-idea:'||NEW.team_id) BEGIN SELECT RAISE(ABORT,'IDEA_LOCKED'); END;

DROP TRIGGER whole_idea_lock;

CREATE TRIGGER whole_idea_lock BEFORE UPDATE ON ideas WHEN NEW.updated_at >= (SELECT json_extract(policy,'$.ideaLock') FROM event_settings WHERE id=1) AND NOT EXISTS(SELECT 1 FROM write_guards WHERE token='admin-idea:'||NEW.team_id) BEGIN SELECT RAISE(ABORT,'IDEA_LOCKED'); END;

CREATE TRIGGER idea_description_insert BEFORE INSERT ON ideas WHEN length(NEW.description)>500 BEGIN SELECT RAISE(ABORT,'IDEA_DESCRIPTION_500'); END;

CREATE TRIGGER idea_description_update BEFORE UPDATE ON ideas WHEN length(NEW.description)>500 BEGIN SELECT RAISE(ABORT,'IDEA_DESCRIPTION_500'); END;
