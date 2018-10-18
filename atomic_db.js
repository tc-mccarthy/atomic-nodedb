class Atomic_Database {
	constructor(config) {
		Object.assign(this, {
			config: config
		});

		this.connect();
	}

	/**
	 * Formats columns to escaped format
	 *
	 * @param Array cols
	 * @return Array
	 */
	columnize(cols) {

		const c = [];

		cols.forEach((col) => {
			if (typeof col === "string") {
				if (col === "*") {
					c.push(col);
				} else {
					c.push(`\`${col}\``);
				}
			}

			if (col instanceof Atomic_RawQuery) {
				c.push(col.getValue());
			}
		});

		return c;
	}

	/**
	 * Builds the WHERE, ORDER BY and GROUP BY clauses
	 *
	 * @param Array options list of objects with WHERE, GROUP, ORDER, LIMIT and ORDER BY objects
	 * @return String
	 */
	buildQueryEnd(options) {
		options = Object.assign({
			where: [],
			group: [],
			order: [],
			limit: false,
			offset: false
		}, options);

		const sql = [];

		// builds the where clause
		options.where.forEach((clause, index) => {
			let statement = "WHERE";

			if (index > 0) {
				statement = "AND";
			}

			sql.push(`${statement} ${clause.col} ${clause.op} ${this.escape(clause.val)}`);
		});

		//build group by, if necessary
		if (options.group.length > 0) {
			sql.push(`GROUP BY ${options.group.join(", ")}`);
		}

		// begin order clause, if defined
		if (options.order.length > 0) {
			const order = [];

			options.order.forEach((clause, index) => {
				order.push(`${clause.col} ${clause.sort}`);
			});

			sql.push(`ORDER BY ${order.join(", ")}`);
		}

		//if there is a limit set, add it to the query
		if (!!options.limit) {
			sql.push(`LIMIT ${options.limit}`);
		}

		//if there is an offset set, add it to the query
		if (!!options.offset) {
			sql.push(`OFFSET ${options.offset}`);
		}

		return sql.join(" ");
	}

	escape(str) {
		return (str + '').replace(/([\\"\\'])/g, '\\$1').replace(/\u0000/g, '\\0');
	}

	/**
	 * Connects to DB and builds out the cluster
	 */
	connect() {
		const mysql = require("mysql"),
			cluster = mysql.createPoolCluster({
				restoreNodeTimeout: 1000
			}),
			hasSlaves = (typeof this.config.mysql.slaves !== "undefined" && this.config.mysql.slaves instanceof Array);

		cluster.add('MASTER', this.config.mysql.master);

		if (!hasSlaves) {
			this.config.mysql.slaves = [];
		}

		this.config.mysql.slaves.forEach((slave, index) => {
			cluster.add(`SLAVE${(index+1)}`, slave);
		});

		this.cluster = cluster;
	}

	/**
	 * Logging output
	 */
	log(query, conn, err) {
		if (this.config.mysql.logging) {
			const log = {
				instance: conn._clusterId,
				query: query,
				err: false
			};

			if (err) {
				log[err] = err;
			}

			console.log(log);
		}
	}

	/**
	 * Executes the query
	 *
	 * @param String query
	 * @return Promise
	 */
	query(query) {
		return new Promise((resolve, reject) => {
			const nonmaster = query.toLowerCase().match(/^(show)|(select)/), //regex is used to figure out if this query is a read-only query
				connectionProcess = (err, conn) => {
					if (err) {
						console.log(err);
						reject(err);
					} else {
						conn.query(query, (err, rows, fields) => {
							conn.release();
							this.log(query, conn, err);
							if (err) {
								reject(err);
							} else {
								resolve({ rows: rows, fields: fields });
							}
						});
					}
				};

			//non read-only queries are sent to the master
			if (!nonmaster) {
				this.cluster.getConnection('MASTER', connectionProcess);
			} else {
				//read-only queries are routed betwixt master and slaves via round-robin
				this.cluster.getConnection(connectionProcess);
			}
		});
	}

	/**
	 * Builds a raw query
	 */
	raw(str) {
		const RawQuery = require("./atomic_rawquery.js");
		return new RawQuery(str);
	}

	/**
	 * Converts string to slug format
	 *
	 * @param String str String to be converted to slug
	 * @return String
	 */
	slugify() {
		return str.trim().replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
	}
}

module.exports = Atomic_Database;