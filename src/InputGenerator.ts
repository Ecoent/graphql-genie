
import { Relations, fieldIsArray, getReturnGraphQLType, getReturnType } from './TypeGeneratorUtils';
import { GraphQLBoolean, GraphQLInputObjectType, GraphQLInputType, GraphQLList, GraphQLNamedType,
	 GraphQLNonNull, GraphQLSchema, IntrospectionObjectType, IntrospectionType, isInputType, isObjectType } from 'graphql';
import { each, get, merge } from 'lodash';

export class InputGenerator {

	private type: GraphQLNamedType;
	private currInputObjectTypes: Map<string, GraphQLInputType>;
	private schemaInfo: IntrospectionType[];
	private schema: GraphQLSchema;
	private relations: Relations;

	constructor($type: GraphQLNamedType, $currInputObjectTypes: Map<string, GraphQLInputType>,
		 $schemaInfo: IntrospectionType[], $schema: GraphQLSchema, $relations: Relations) {
		this.type = $type;
		this.currInputObjectTypes = $currInputObjectTypes;
		this.schemaInfo = $schemaInfo;
		this.schema = $schema;
		this.relations = $relations;
	}

	private capFirst(val: string) {
		return val.charAt(0).toUpperCase() + val.slice(1);
	}

	generateFieldForInput = (fieldName: string, inputType: GraphQLInputType, defaultValue?: string): object => {
		const field = {};
		field[fieldName] = {
			type: inputType,
			defaultValue: defaultValue
		};
		return field;
	}


	generateWhereUniqueInput(fieldType: GraphQLNamedType = this.type): GraphQLInputType {
		const name = fieldType.name + 'WhereUniqueInput';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			const infoType = <IntrospectionObjectType>this.schemaInfo[fieldType.name];
			infoType.fields.forEach(field => {
				if (get(field, 'metadata.unique') === true) {
					const isArray = fieldIsArray(field.type);
					const schemaType = this.schema.getType(getReturnType(field.type));
					let inputType;
					if (isInputType(schemaType)) {
						inputType = schemaType;
					} else {
						const fieldInputName = schemaType.name + 'WhereUniqueInput';
						inputType = new GraphQLInputObjectType({name: fieldInputName, fields: {}});
					}
					if (isArray) {
						inputType = new GraphQLList(inputType);
					}
					merge(fields, this.generateFieldForInput(
						field.name,
						inputType,
						get(field, 'metadata.defaultValue')));
				}
			});

			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateCreateWithoutInput(fieldType: GraphQLNamedType, relationFieldName?: string): GraphQLInputType {

		let name = fieldType.name + 'Create';
		name += relationFieldName ? 'Without' + this.capFirst(relationFieldName) : '';
		name += 'Input';
		if (!relationFieldName) {
			return new GraphQLInputObjectType({name, fields: {}});
		}
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			const infoType = <IntrospectionObjectType>this.schemaInfo[fieldType.name];
			infoType.fields.forEach(field => {
				if (field.name !== relationFieldName) {
					const fieldTypeName = getReturnType(field.type);
					const schemaType = this.schema.getType(fieldTypeName);
					let inputType;
					if (isInputType(schemaType)) {
						inputType = schemaType;
					} else {
						const isArray = fieldIsArray(field.type);
						let fieldInputName = schemaType.name + 'Create';
						fieldInputName += isArray ? 'Many' : 'One';

						const relationFieldName = this.relations.getInverseWithoutName(fieldTypeName, field.name);
						fieldInputName += relationFieldName ? 'Without' + this.capFirst(relationFieldName) : '';
						fieldInputName += 'Input';
						inputType = new GraphQLInputObjectType({name: fieldInputName, fields: {}});
					}

					merge(fields, this.generateFieldForInput(
						field.name,
						inputType,
						get(field, 'metadata.defaultValue')));
				}
			});

			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}



	generateCreateManyWithoutInput(fieldType: GraphQLNamedType, relationFieldName: string): GraphQLInputType {
		const name = fieldType.name + 'CreateManyWithout' + this.capFirst(relationFieldName) + 'Input';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = {type: new GraphQLList(new GraphQLNonNull(this.generateCreateWithoutInput(fieldType, relationFieldName)))};
			fields['connect'] = {type: new GraphQLList(new GraphQLNonNull(this.generateWhereUniqueInput(fieldType)))};
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateCreateOneWithoutInput(fieldType: GraphQLNamedType, relationFieldName: string): GraphQLInputType {
		const name = fieldType.name + 'CreateOneWithout' + this.capFirst(relationFieldName) + 'Input';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = {type: this.generateCreateWithoutInput(fieldType, relationFieldName)};
			fields['connect'] = {type: this.generateWhereUniqueInput(fieldType)};
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateCreateManyInput(fieldType: GraphQLNamedType): GraphQLInputType {
		const name = fieldType.name + 'CreateManyInput';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = new GraphQLList(new GraphQLNonNull(this.generateCreateWithoutInput(fieldType)));
			fields['connect'] = new GraphQLList(new GraphQLNonNull(this.generateWhereUniqueInput(fieldType)));
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateCreateOneInput(fieldType: GraphQLNamedType): GraphQLInputType {
		const name = fieldType.name + 'CreateOneInput';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = this.generateCreateWithoutInput(fieldType);
			fields['connect'] = this.generateWhereUniqueInput(fieldType);
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateCreateInput(): GraphQLInputType {
		const name = this.type.name + 'CreateInput';
		const fields = {};
		if (isObjectType(this.type) && !this.currInputObjectTypes.has(name)) {
			each(this.type.getFields(), field => {
				if (field.name !== 'id') {
					let inputType;
					if (isInputType(field.type)) {
						inputType = field.type;
					} else {
						const fieldType = getReturnGraphQLType(field.type);
						const relationFieldName = this.relations.getInverseWithoutName(fieldType.name, field.name);
						const isList = fieldIsArray(field.type);
						if (relationFieldName) {
							// tslint:disable-next-line:prefer-conditional-expression
							if (isList) {
								inputType = this.generateCreateManyWithoutInput(fieldType, relationFieldName);
							} else {
								inputType = this.generateCreateOneWithoutInput(fieldType, relationFieldName);
							}
						} else {
							if (isList) {
								inputType = this.generateCreateManyInput(fieldType);
							} else {
								inputType = this.generateCreateOneInput(fieldType);
							}
						}
					}
					merge(fields, this.generateFieldForInput(
						field.name,
						inputType,
						get(this.schemaInfo[this.type.name].fields.find((introField) => introField.name === field.name), 'metadata.defaultValue')));
				}
			});

			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));

		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpdateWithoutInput(fieldType: GraphQLNamedType, relationFieldName?: string): GraphQLInputType {

		let name = fieldType.name + 'Update';
		name += relationFieldName ? 'Without' + this.capFirst(relationFieldName) : '';
		name += 'Input';
		if (!relationFieldName) {
			return new GraphQLInputObjectType({name, fields: {}});
		}
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			const infoType = <IntrospectionObjectType>this.schemaInfo[fieldType.name];
			infoType.fields.forEach(field => {
				if (field.name !== relationFieldName) {
					const fieldTypeName = getReturnType(field.type);
					const schemaType = this.schema.getType(fieldTypeName);
					let inputType;
					if (isInputType(schemaType)) {
						inputType = schemaType;
					} else {
						const isArray = fieldIsArray(field.type);
						let fieldInputName = schemaType.name + 'Update';
						fieldInputName += isArray ? 'Many' : 'One';

						const relationFieldName = this.relations.getInverseWithoutName(fieldTypeName, field.name);
						fieldInputName += relationFieldName ? 'Without' + this.capFirst(relationFieldName) : '';
						fieldInputName += 'Input';
						inputType = new GraphQLInputObjectType({name: fieldInputName, fields: {}});
					}

					merge(fields, this.generateFieldForInput(
						field.name,
						inputType,
						get(field, 'metadata.defaultValue')));
				}
			});

			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpdateWithWhereUniqueWithoutInput(fieldType: GraphQLNamedType, relationFieldName?: string): GraphQLInputType {
		const name = fieldType.name + 'UpdateWithWhereUniqueWithout' + this.capFirst(relationFieldName) + 'Input';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['data'] = {type: new GraphQLNonNull(this.generateUpdateWithoutInput(fieldType, relationFieldName))};
			fields['where'] = {type: new GraphQLNonNull(this.generateWhereUniqueInput(fieldType))};
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpdateManyWithoutInput(fieldType: GraphQLNamedType, relationFieldName: string): GraphQLInputType {
		const name = fieldType.name + 'UpdateManyWithout' + this.capFirst(relationFieldName) + 'Input';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = {type: new GraphQLList(new GraphQLNonNull(this.generateCreateWithoutInput(fieldType, relationFieldName)))};
			fields['connect'] = {type: new GraphQLList(new GraphQLNonNull(this.generateWhereUniqueInput(fieldType)))};
			fields['disconnect'] = {type: new GraphQLList(new GraphQLNonNull(this.generateWhereUniqueInput(fieldType)))};
			fields['delete'] = {type: new GraphQLList(new GraphQLNonNull(this.generateWhereUniqueInput(fieldType)))};
			fields['update'] = {type: new GraphQLList(new GraphQLNonNull(this.generateUpdateWithWhereUniqueWithoutInput(fieldType, relationFieldName)))};
			fields['upsert'] = {type: new GraphQLList(new GraphQLNonNull(this.generateUpsertWithWhereUniqueWithoutInput(fieldType, relationFieldName)))};
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpdateOneWithoutInput(fieldType: GraphQLNamedType, relationFieldName: string): GraphQLInputType {
		const name = fieldType.name + 'UpdateOneWithout' + this.capFirst(relationFieldName) + 'Input';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = {type: this.generateCreateWithoutInput(fieldType, relationFieldName)};
			fields['connect'] = {type: this.generateWhereUniqueInput(fieldType)};
			fields['disconnect'] = {type: GraphQLBoolean};
			fields['delete'] = {type: GraphQLBoolean};
			fields['update'] = {type: this.generateUpdateWithoutInput(fieldType, relationFieldName)};
			fields['upsert'] = {type: this.generateUpsertWithoutInput(fieldType, relationFieldName)};
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpdateManyInput(fieldType: GraphQLNamedType): GraphQLInputType {
		const name = fieldType.name + 'UpdateManyInput';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = new GraphQLList(new GraphQLNonNull(this.generateUpdateWithoutInput(fieldType)));
			fields['connect'] = new GraphQLList(new GraphQLNonNull(this.generateWhereUniqueInput(fieldType)));
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpdateOneInput(fieldType: GraphQLNamedType): GraphQLInputType {
		const name = fieldType.name + 'UpdateOneInput';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['create'] = this.generateUpdateWithoutInput(fieldType);
			fields['connect'] = this.generateWhereUniqueInput(fieldType);
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}


	generateUpdateInput(): GraphQLInputType {
		const name = this.type.name + 'UpdateInput';
		const fields = {};
		if (isObjectType(this.type) && !this.currInputObjectTypes.has(name)) {
			each(this.type.getFields(), field => {
				if (field.name !== 'id') {
					let inputType;
					if (isInputType(field.type)) {
						inputType = field.type;
					} else {
						const fieldType = getReturnGraphQLType(field.type);
						const relationFieldName = this.relations.getInverseWithoutName(fieldType.name, field.name);
						const isList = fieldIsArray(field.type);
						if (relationFieldName) {
							// tslint:disable-next-line:prefer-conditional-expression
							if (isList) {
								inputType = this.generateUpdateManyWithoutInput(fieldType, relationFieldName);
							} else {
								inputType = this.generateUpdateOneWithoutInput(fieldType, relationFieldName);
							}
						} else {
							if (isList) {
								inputType = this.generateUpdateManyInput(fieldType);
							} else {
								inputType = this.generateUpdateOneInput(fieldType);
							}
						}
					}
					merge(fields, this.generateFieldForInput(
						field.name,
						inputType,
						get(this.schemaInfo[this.type.name].fields.find((introField) => introField.name === field.name), 'metadata.defaultValue')));
				}
			});

			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));

		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpsertWithoutInput(fieldType: GraphQLNamedType, relationFieldName?: string): GraphQLInputType {

		let name = fieldType.name + 'Upsert';
		name += relationFieldName ? 'Without' + this.capFirst(relationFieldName) : '';
		name += 'Input';
		if (!relationFieldName) {
			return new GraphQLInputObjectType({name, fields: {}});
		}
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			const infoType = <IntrospectionObjectType>this.schemaInfo[fieldType.name];
			infoType.fields.forEach(field => {
				if (field.name !== relationFieldName) {
					const fieldTypeName = getReturnType(field.type);
					const schemaType = this.schema.getType(fieldTypeName);
					let inputType;
					if (isInputType(schemaType)) {
						inputType = schemaType;
					} else {
						const isArray = fieldIsArray(field.type);
						let fieldInputName = schemaType.name + 'Update';
						fieldInputName += isArray ? 'Many' : 'One';

						const relationFieldName = this.relations.getInverseWithoutName(fieldTypeName, field.name);
						fieldInputName += relationFieldName ? 'Without' + this.capFirst(relationFieldName) : '';
						fieldInputName += 'Input';
						inputType = new GraphQLInputObjectType({name: fieldInputName, fields: {}});
					}

					merge(fields, this.generateFieldForInput(
						field.name,
						inputType,
						get(field, 'metadata.defaultValue')));
				}
			});

			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}

	generateUpsertWithWhereUniqueWithoutInput(fieldType: GraphQLNamedType, relationFieldName?: string): GraphQLInputType {
		const name = fieldType.name + 'UpsertWithWhereUniqueWithout' + this.capFirst(relationFieldName) + 'Input';
		if (!this.currInputObjectTypes.has(name)) {
			const fields = {};
			fields['update'] = {type: new GraphQLNonNull(this.generateUpdateWithoutInput(fieldType, relationFieldName))};
			fields['create'] = {type: new GraphQLNonNull(this.generateCreateWithoutInput(fieldType, relationFieldName))};
			fields['where'] = {type: new GraphQLNonNull(this.generateWhereUniqueInput(fieldType))};
			this.currInputObjectTypes.set(name, new GraphQLInputObjectType({
				name,
				fields
			}));
		}
		return this.currInputObjectTypes.get(name);
	}
}
