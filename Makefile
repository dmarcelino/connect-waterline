
test: test-integration

test-unit:
	@echo "\nRunning unit tests..."
	@NODE_ENV=test mocha test/unit
  
test-integration:
	@echo "\nRunning integration tests..."
	@NODE_ENV=test node test/integration/runner.js
