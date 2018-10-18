class Atomic_RawQuery {
	constructor(str) {
		Object.assign(this, {
			value: str
		});
	}

	getValue() {
		return this.value;
	}
}

module.exports = Atomic_RawQuery;