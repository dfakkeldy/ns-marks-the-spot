.PHONY: devlog-update doc-automation-test

devlog-update: ## Update generated weekly devlog blocks from the previous calendar week
	@PYTHONPATH=Scripts python3 -m doc_automation.devlog \
		--markdown docs/guides/devlog.md \
		--html docs/devlog.html \
		--repo-url https://github.com/dfakkeldy/ns-marks-the-spot

doc-automation-test: ## Run the doc-automation Python unit tests
	@PYTHONPATH=Scripts python3 -m unittest discover -s Scripts/doc_automation/tests -t Scripts -v
