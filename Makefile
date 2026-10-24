APP_DIR := $(HOME)/.config/spicetify/CustomApps/labels

.PHONY: install uninstall

install:
	mkdir -p $(APP_DIR)
	rsync -a --delete src/ $(APP_DIR)/
	spicetify config custom_apps labels
	spicetify apply

uninstall:
	spicetify config custom_apps labels-
	spicetify apply
	rm -rf $(APP_DIR)
