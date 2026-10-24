APP_DIR := $(HOME)/.config/spicetify/CustomApps/labels

.PHONY: deps install uninstall

deps:
	command -v spicetify >/dev/null || brew install spicetify-cli
	grep -qE '^version = .+' "$$(spicetify -c)" || spicetify backup apply

install: deps
	mkdir -p $(APP_DIR)
	rsync -a --delete src/ $(APP_DIR)/
	spicetify config custom_apps labels
	spicetify apply

uninstall:
	spicetify config custom_apps labels-
	spicetify apply
	rm -rf $(APP_DIR)
