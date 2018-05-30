import fortune from 'fortune';
import { IntrospectionInterfaceType, IntrospectionType } from 'graphql';
import { each, find, findIndex, forOwn, get, isArray, isEmpty, isEqual, isString, keys, set } from 'lodash';
import fortuneCommon from '../node_modules/fortune/lib/adapter/adapters/common';
import { Connection, DataResolver, DataResolverInputHook, DataResolverOutputHook, Features, FortuneOptions } from './GraphQLGenieInterfaces';
import { computeRelations } from './TypeGeneratorUtilities';

export default class FortuneGraph implements DataResolver {

	private fortuneOptions: FortuneOptions;
	private fortuneTypeNames: Map<string, string>;
	private uniqueIndexes: Map<string, string[]>;
	private schemaInfo: IntrospectionType[];
	private inputHooks: Map<string, DataResolverInputHook[]>;
	private outputHooks: Map<string, DataResolverOutputHook[]>;
	private store;
	constructor(fortuneOptions: FortuneOptions, schemaInfo: IntrospectionType[]) {
		this.fortuneOptions = fortuneOptions;
		if (!this.fortuneOptions || !this.fortuneOptions.hooks) {
			set(this.fortuneOptions, 'hooks', {});
		}
		this.schemaInfo = schemaInfo;
		this.uniqueIndexes = new Map<string, string[]>();
		this.inputHooks = new Map<string, DataResolverInputHook[]>();
		this.outputHooks = new Map<string, DataResolverOutputHook[]>();
		this.store = this.buildFortune();
	}

	private getReturnResults = (results: any[], fortuneType: string, graphQLTypeName: string) => {
		return results.map(record => {
			if (!record) {
				return record;
			}
			const currTypeName = record['__typename'] || graphQLTypeName;
			record.id = this.computeReturnId(record.id, currTypeName);
			for (const argName in record) {
				const link = get(this.store, `recordTypes.${fortuneType}.${argName}.link`);
				let arg = record[argName];
				if (arg && link && argName !== 'id') {
					if (isArray(arg)) {
						arg = arg.map(currId => {
							return this.computeReturnId(currId, currTypeName);
						});
					} else {
						arg = this.computeReturnId(arg, currTypeName);
					}
					record[argName] = arg;
				}
			}
			return record;
		});
	}

	private getFortuneIds = (ids: any[]) => {
		ids = isArray(ids) ? ids : [ids];
		return ids.map(id => {
			return this.getFortuneId(id);
		});
	}

	private computeReturnId = (id: string, graphType: string) => {
		return btoa(`${id}:${graphType}`);
	}

	public getFortuneId = (inputId: string): string => {
		let result: string;
		try {
			result = atob(inputId).split(':')[0];
		} catch (e) {
			result = inputId;
		}

		return result;
	}

	private getTypeFromId = (inputId: string): string => {
		let result: string;
		try {
			result = atob(inputId).split(':')[1];
		} catch (e) {
			result = inputId;
		}

		return result;
	}

	public getValueByUnique = async (returnTypeName: string, args): Promise<Object> => {
		let currValue;
		// tslint:disable-next-line:prefer-conditional-expression
		if (args.id) {
			currValue = await this.find(returnTypeName, [args.id]);
		} else {
			currValue = await this.find(returnTypeName, undefined, { match: args });
		}
		return isArray(currValue) ? currValue[0] : currValue;
	}

	public canAdd = async (graphQLTypeName: string, inputRecords: object[]): Promise<boolean> => {
		let canAdd = true;
		if (inputRecords && this.uniqueIndexes.has(graphQLTypeName)) {
			await Promise.all(this.uniqueIndexes.get(graphQLTypeName).map(async (fieldName) => {
				await Promise.all(inputRecords.map(async (inputRecord) => {
					if (canAdd && inputRecord[fieldName]) {
						const dbRecord = await this.getValueByUnique(graphQLTypeName, { [fieldName]: inputRecord[fieldName] });
						if (dbRecord) {
							canAdd = false;
						}
					}
				}));
			}));
		}
		return canAdd;
	}

	public getConnection = (allEdges: any[], before: string, after: string, first: number, last: number): Connection => {
		const connection: Connection = new Connection();
		const edgesWithCursorApplied = this.applyCursorsToEdges(allEdges, before, after);
		connection.aggregate.count = allEdges.length;
		connection.edges = this.edgesToReturn(edgesWithCursorApplied, first, last);
		if (typeof last !== 'undefined') {
			if (edgesWithCursorApplied.length > last) {
				connection.pageInfo.hasPreviousPage = true;
			}
		} else if (typeof after !== 'undefined' && get(allEdges, '[0].id', 'id0') !== get(edgesWithCursorApplied, '[0].id', 'id1')) {
			connection.pageInfo.hasPreviousPage = true;
		}

		if (typeof first !== 'undefined') {
			if (edgesWithCursorApplied.length > first) {
				connection.pageInfo.hasNextPage = true;
			}
		} else if (typeof before !== 'undefined' && get(allEdges, `[${allEdges.length - 1}].id`, 'id0') !== get(edgesWithCursorApplied, `[${edgesWithCursorApplied.length - 1}].id`, 'id1')) {
			connection.pageInfo.hasNextPage = true;
		}
		connection.pageInfo.startCursor = get(connection.edges, '[0].id');
		connection.pageInfo.endCursor = get(connection.edges, `[${connection.edges.length - 1}].id`);
		return connection;
	}

	private edgesToReturn = (edgesWithCursorApplied: any[], first: number, last: number): any[] => {
		if (typeof first !== 'undefined') {
			if (first < 0) {
				throw new Error('first must be greater than 0');
			} else if (edgesWithCursorApplied.length > first) {
				edgesWithCursorApplied = edgesWithCursorApplied.slice(0, first);
			}
		}
		if (typeof last !== 'undefined') {
			if (last < 0) {
				throw new Error('first must be greater than 0');
			} else if (edgesWithCursorApplied.length > last) {
				edgesWithCursorApplied = edgesWithCursorApplied.slice(edgesWithCursorApplied.length - last, edgesWithCursorApplied.length);
			}
		}
		return edgesWithCursorApplied;
	}

	private applyCursorsToEdges = (allEdges: any[], before: string, after: string): any[] => {
		let edges = allEdges;
		if (after) {
			const afterEdgeIndex = findIndex(edges, ['id', after]);
			if (afterEdgeIndex > -1) {
				edges = edges.slice(afterEdgeIndex + 1, edges.length);
			}
		}

		if (before) {
			const beforeEdgeIndex = findIndex(edges, ['id', before]);
			if (beforeEdgeIndex > -1) {
				edges = edges.slice(0, beforeEdgeIndex);
			}
		}

		return edges;
	}

	private getDataTypeName(graphQLTypeName: string): string {
		graphQLTypeName = graphQLTypeName.endsWith('Connection') ? graphQLTypeName.replace(/Connection$/g, '') : graphQLTypeName;
		graphQLTypeName = graphQLTypeName.endsWith('Edge') ? graphQLTypeName.replace(/Edge$/g, '') : graphQLTypeName;
		return graphQLTypeName;
	}

	public create = async (graphQLTypeName: string, records, include?, meta?) => {
		const fortuneType = this.getFortuneTypeName(graphQLTypeName);
		records = isArray(records) ? records.map(value => this.generateCreateRecords(fortuneType, value)) : this.generateCreateRecords(fortuneType, records);

		records['__typename'] = graphQLTypeName;

		let results = await this.store.create(fortuneType, records, include, meta);
		results = results.payload.records;
		results = this.getReturnResults(results, fortuneType, graphQLTypeName);
		return isArray(records) ? results : results[0];
	}

	public find = async (graphQLTypeName: string, ids?: string[], options?, include?, meta?) => {
		let results;
		let fortuneType: string;
		if (graphQLTypeName === 'Node') {
			fortuneType = this.getFortuneTypeName(this.getTypeFromId(ids[0]));
			results = await this.store.find(fortuneType, this.getFortuneId(ids[0]), options, include, meta);
		} else {
			fortuneType = this.getFortuneTypeName(graphQLTypeName);
			// pull the id out of the match options
			if (get(options, 'match.id')) {
				ids = get(options, 'match.id');
				delete options.match.id;
			}
			ids = ids && this.getFortuneIds(ids);
			options = this.generateOptions(options, graphQLTypeName, ids);
			results = await this.store.find(fortuneType, ids, options, include, meta);
		}
		let graphReturn: any[] = get(results, 'payload.records');
		if (graphReturn) {

			if (!options.sort) {
				// to support relay plural identifying root fields results should be in the order in which they were requested,
				// with null being returned by failed finds
				if (ids) {
					const newReturn = [];
					ids.forEach((value) => {
						const foundResult = find(graphReturn, ['id', value]);
						if (foundResult) {
							newReturn.push(foundResult);
						} else {
							newReturn.push(null);
						}
					});
					graphReturn = newReturn;
				} else if (this.uniqueIndexes.has(graphQLTypeName)) {
					const matches: object = options.match;
					if (matches['__typename']) {
						delete matches['__typename'];
					}
					const matchesKeys = Object.keys(matches);
					if (matchesKeys.length === 1) {
						const key = matchesKeys[0];
						if (this.uniqueIndexes.get(graphQLTypeName).includes(key)) {
							const theMatch = isArray(matches[key]) ? matches[key] : [matches[key]];
							const newReturn = [];
							theMatch.forEach((value) => {
								const foundResult = find(graphReturn, [key, value]);
								if (foundResult) {
									newReturn.push(foundResult);
								} else {
									newReturn.push(null);
								}
							});
							graphReturn = newReturn;
						}
					}
				}
			}
			graphReturn = this.getReturnResults(graphReturn, fortuneType, graphQLTypeName);
			// if one id sent in we just want to return the value not an array
			graphReturn = ids && ids.length === 1 ? graphReturn[0] : graphReturn;
		}
		if (!graphReturn) {
			console.log('Nothing Found ' + graphQLTypeName + ' ' + JSON.stringify(ids) + ' ' + JSON.stringify(options));
		}
		return graphReturn;

	}

	public update = async (graphQLTypeName: string, records, meta?, options?: object) => {
		const fortuneType = this.getFortuneTypeName(graphQLTypeName);
		const updates = isArray(records) ? records.map(value => this.generateUpdates(fortuneType, value, options)) : this.generateUpdates(fortuneType, records, options);
		let results = await this.store.update(fortuneType, updates, meta);
		results = results.payload.records;
		this.getReturnResults(results, fortuneType, graphQLTypeName);
		return isArray(records) ? results : results[0];
	}

	public delete = async (graphQLTypeName: string, ids?: string[], meta?) => {
		const fortuneType = this.getFortuneTypeName(graphQLTypeName);
		ids = isArray(ids) ? ids.map(value => this.getFortuneId(value)) : [this.getFortuneId(ids)];

		await this.store.delete(fortuneType, ids, meta);
		return true;
	}

	private generateCreateRecords = (fortuneTypeName: string, record) => {
		for (const argName in record) {
			const link = get(this.store, `recordTypes.${fortuneTypeName}.${argName}.link`);
			let arg = record[argName];
			if (arg && link && argName !== 'id') {
				if (isArray(arg)) {
					arg = arg.map(currId => {
						return this.getFortuneId(currId);
					});
				} else {
					arg = this.getFortuneId(arg);
				}
				record[argName] = arg;
			}
		}
		return record;
	}

	private generateUpdates = (fortuneTypeName: string, record, options: object = {}) => {
		const updates = { id: this.getFortuneId(record['id']), replace: {}, push: {}, pull: {} };
		for (const argName in record) {
			const link = get(this.store, `recordTypes.${fortuneTypeName}.${argName}.link`);
			let arg = record[argName];
			if (argName !== 'id') {
				if (isArray(arg)) {
					if (link && arg) {
						arg = arg.map(currId => {
							return this.getFortuneId(currId);
						});
					}
					if (options['pull']) {
						updates.pull[argName] = arg;
					} else {
						updates.push[argName] = arg;
					}
				} else {
					if (link && arg) {
						arg = this.getFortuneId(arg);
					}
					updates.replace[argName] = arg;
				}
			} else {
				arg = this.getFortuneId(arg);
			}
		}
		return updates;
	}

	public getLink = (graphQLTypeName: string, field: string): string => {
		const fortuneType = this.getFortuneTypeName(graphQLTypeName);
		return get(this.store, `recordTypes.${fortuneType}.${field}.link`);
	}

	public getStore = () => {
		if (!this.store) {
			this.store = this.buildFortune();
		}
		return this.store;
	}

	private computeFortuneTypeNames = (): Map<string, string> => {
		this.fortuneTypeNames = new Map<string, string>();
		each(keys(this.schemaInfo), (typeName) => {
			if (typeName !== 'Node' && !this.fortuneTypeNames.has(typeName)) {
				const type = <IntrospectionInterfaceType>this.schemaInfo[typeName];
				if (!isEmpty(type.possibleTypes)) {
					const possibleTypes = [type.name];
					each(type.possibleTypes, possibleType => {
						if (possibleTypes.indexOf(possibleType.name) < 0) {
							possibleTypes.push(possibleType.name);
						}
						possibleType = this.schemaInfo[possibleType.name];
						each(possibleType['interfaces'], currInterface => {
							if (currInterface.name !== 'Node' && currInterface.name !== typeName) {
								if (possibleTypes.indexOf(currInterface.name) < 0) {
									possibleTypes.push(currInterface.name);
								}
							}
						});
						each(possibleType['unions'], currUnion => {
							if (currUnion.name !== typeName) {
								if (possibleTypes.indexOf(currUnion.name) < 0) {
									possibleTypes.push(currUnion.name);
								}
							}
						});
					});
					possibleTypes.sort();
					const fortuneTypeName = possibleTypes.join('_');
					each(possibleTypes, currTypeName => {
						this.fortuneTypeNames.set(currTypeName, fortuneTypeName);
					});
				}
			}

		});

		return this.fortuneTypeNames;
	}

	public getFortuneTypeName = (name: string): string => {
		name = this.getDataTypeName(name);
		return this.fortuneTypeNames.has(name) ? this.fortuneTypeNames.get(name) : name;
	}

	private buildFortune = () => {
		this.computeFortuneTypeNames();
		const relations = computeRelations(this.schemaInfo, this.getFortuneTypeName);
		const fortuneConfig = {};
		forOwn(this.schemaInfo, (type: any, name: string) => {
			if (type.kind === 'OBJECT' && name !== 'Query' && name !== 'Mutation' && name !== 'Subscription') {
				const fields = {};
				forOwn(type.fields, (field) => {
					if (field.name !== 'id') {

						let currType = field.type;
						let isArray = false;
						while (currType.kind === 'NON_NULL' || currType.kind === 'LIST') {
							if (currType.kind === 'LIST') {
								isArray = true;
							}
							currType = currType.ofType;
						}
						if (get(field, 'metadata.unique') === true) {
							if (isArray) {
								console.error('Unique may not work on list types', name, field.name);
							}
							if (!this.uniqueIndexes.has(name)) {
								this.uniqueIndexes.set(name, []);
							}
							this.uniqueIndexes.get(name).push(field.name);
						}
						currType = currType.kind === 'ENUM' ? 'String' : currType.name;
						if (currType === 'ID' || currType === 'String') {
							currType = String;
						} else if (currType === 'Int' || currType === 'Float') {
							currType = Number;
						} else if (currType === 'Boolean') {
							currType = Boolean;
						} else if (currType === 'JSON') {
							currType = Object;
						} else if (currType === 'Date' || currType === 'Time' || currType === 'DateTime') {
							currType = Date;
						}
						let inverse: string;
						if (isString(currType)) {
							currType = this.getFortuneTypeName(currType);
							inverse = relations.getInverseWithoutName(currType, field.name);
						}
						currType = isArray ? Array(currType) : currType;
						if (inverse) {
							currType = [currType, inverse];
						}

						fields[field.name] = currType;
					}
					fields['__typename'] = String;
				});
				const fortuneName = this.getFortuneTypeName(name);
				const fortuneConfigForName = fortuneConfig[fortuneName] ? fortuneConfig[fortuneName] : {};
				each(keys(fields), (fieldName) => {
					const currType = fortuneConfigForName[fieldName];
					const newType = fields[fieldName];
					if (!currType) {
						fortuneConfigForName[fieldName] = newType;
					} else {
						let badSchema = typeof newType !== typeof currType;
						badSchema = badSchema ? badSchema : !isEqual(fortuneConfigForName[fieldName], fields[fieldName]);

						if (badSchema) {
							console.error('Bad schema. Types that share unions/interfaces have fields of the same name but different types. This is not allowed\n',
								'fortune type', fortuneName, '\n',
								'field name', fieldName, '\n',
								'currType', fortuneConfigForName[fieldName], '\n',
								'newType', fields[fieldName]);
						}

					}
				});
				fortuneConfig[fortuneName] = fortuneConfigForName;
				if (!this.fortuneOptions.hooks[fortuneName]) {
					this.fortuneOptions.hooks[fortuneName] = [this.inputHook(fortuneName), this.outputHook(fortuneName)];
				}
			}

		});
		const store = fortune(fortuneConfig, this.fortuneOptions);
		return store;
	}

	private inputHook(_fortuneType: string) {
		return (context, record, update) => {
			if (record['__typename'] && this.inputHooks.has(record['__typename'])) {
				this.inputHooks.get(record['__typename']).forEach(hook => {
					hook(context, record, update);
				});
			}
		};
	}

	private outputHook(_fortuneType: string) {
		return (context, record) => {
			if (record['__typename'] && this.outputHooks.has(record['__typename'])) {
				this.outputHooks.get(record['__typename']).forEach(hook => {
					hook(context, record);
				});
			}
		};
	}

	public getFeatures(): Features {
		return this.store.adapter.features || {};
	}

	private generateOptions = (options, graphQLTypeName?: string, ids?): Object => {
		options = options ? Object.assign({}, options) : {};

		// if no ids we need to make sure we only get the necessary typename so that this works with interfaces/unions
		if (graphQLTypeName && (!ids || ids.length < 1)) {
			set(options, 'match.__typename', this.getDataTypeName(graphQLTypeName));
		}

		// make sure sort is boolean rather than enum
		if (options.orderBy) {
			const sort = {};
			for (const fieldName in options.orderBy) {
				if (options.orderBy[fieldName] === 'ASCENDING' || options.orderBy[fieldName] === 'ASC') {
					sort[fieldName] = true;
				} else if (options.orderBy[fieldName] === 'DESCENDING' || options.orderBy[fieldName] === 'DESC') {
					sort[fieldName] = false;
				}
			}
			options.sort = sort;
			delete options.orderBy;
		}
		return options;
	}

	public applyOptions(graphQLTypeName: string, records, options, meta?) {
		records = isArray(records) ? records : [records];
		options = this.generateOptions(options);
		const fortuneType = this.getFortuneTypeName(graphQLTypeName);
		return fortuneCommon.applyOptions(this.store.recordTypes[fortuneType], records, options, meta);
	}

	public addOutputHook(graphQLTypeName: string, hook: DataResolverOutputHook) {
		if (!this.outputHooks.has(graphQLTypeName)) {
			this.outputHooks.set(graphQLTypeName, [hook]);
		} else {
			this.outputHooks.get(graphQLTypeName).push(hook);
		}
	}

	public addInputHook(graphQLTypeName: string, hook: DataResolverInputHook) {
		if (!this.inputHooks.has(graphQLTypeName)) {
			this.inputHooks.set(graphQLTypeName, [hook]);
		} else {
			this.inputHooks.get(graphQLTypeName).push(hook);
		}
	}
}