import { IExecuteFunctions } from 'n8n-core';
import {
	ICredentialDataDecryptedObject,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import * as AWS from 'aws-sdk';

export class AwsEcs implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AWS ECS',
		name: 'awsEcs',
		icon: 'file:ecs.svg',
		group: ['transform'],
		version: 1,
		description: 'Consume the AWS ECS API',
		subtitle: '={{$parameter["operation"]}}',
		defaults: {
			name: 'AWS ECS',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'aws',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Task',
						value: 'runTask',
						action: 'Starts a new task using the specified task definition',
					},
				],
				default: 'runTask',
			},
			{
				displayName: 'Launch Type',
				name: 'launchType',
				required: true,
				type: 'options',
				options: [
					{
						name: 'EC2',
						value: 'EC2',
						action: 'Runs your tasks on Amazon EC2 instances registered to your cluster',
					},
					{
						name: 'Fargate',
						value: 'FARGATE',
						action: 'Runs your tasks on Fargate On-Demand infrastructure',
					},
					{
						name: 'External',
						value: 'EXTERNAL',
						action: 'Runs your tasks on your on-premises server or virtual machine (VM) capacity registered to your cluster',
					},
				],
				default: 'FARGATE',
				description: 'The infrastructure to run your standalone task on',
				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
					},
				},
			},
			{
				displayName: 'Cluster',
				name: 'cluster',
				type: 'string',
				default: '',
				description: 'The short name or full Amazon Resource Name (ARN) of the cluster to run your task on. If you do not specify a cluster, the default cluster is assumed.',
				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
					},
				},
			},
			{
				displayName: 'Task Definition',
				name: 'taskDefinition',
				type: 'string',
				default: '',
				required: true,
				description: 'The family and revision (family:revision) or full ARN of the task definition to run. If a revision isn\'t specified, the latest ACTIVE revision is used.',
				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
					},
				},
			},
			{
				displayName: 'Count',
				name: 'count',
				type: 'number',
				typeOptions: {
					minValue: 1,
					maxValue: 10,
				},
				default: 1,
				required: true,
				description: 'The number of instantiations of the specified task to place on your cluster. You can specify up to 10 tasks for each call.',

				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
					},
				},
			},
			{
				displayName: 'Enable ECS Managed Tags',
				name: 'enableECSManagedTags',
				type: 'boolean',
				default: false,
				description: 'Whether to use Amazon ECS managed tags for the task',
				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
					},
				},
			},
			{
				displayName: 'Propagate Tags',
				name: 'propagateTags',
				type: 'options',
				options: [
					{
						name: 'None',
						value: 'NONE',
						action: 'Do not propagate tags',
					},
					{
						name: 'Service',
						value: 'SERVICE',
						action: 'Propagate the tags from the service to the task',
					},
					{
						name: 'Task Definition',
						value: 'TASK_DEFINITION',
						action: 'Propagate the tags from the task definition to the task',
					},
				],
				default: 'NONE',
				description: 'Specifies whether to propagate the tags from the task definition to the task. If no value is specified, the tags aren\'t propagated. Tags can only be propagated to the task during task creation.',
				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
						enableECSManagedTags: [
							true,
						],
					},
				},
			},
			{
				displayName: "Network Configuration",
				name: "networkConfiguration",
				placeholder: "Add Configuration",
				type: "fixedCollection",
				typeOptions: {
					multipleValues: false,
				},
				description: "The query parameter to send",
				default: {},
				options: [
					{
						name: "awsvpcConfiguration",
						displayName: "VPC Configuration",
						values: [
							{
								displayName: "Assign Public IP",
								name: "assignPublicIp",
								type: 'options',
								options: [
									{
										name: 'Enabled',
										value: 'ENABLED',
										action: 'Assign a public IP address',
									},
									{
										name: 'Disabled',
										value: 'DISABLED',
										action: 'Do not assign a public IP address',
									},
								],
								default: "DISABLED",
								description: "Whether the task's elastic network interface receives a public IP address. The default value is DISABLED.",
							},
							{
								displayName: "Subnets",
								name: "subnets",
								placeholder: "Add Subnet",
								type: "fixedCollection",
								typeOptions: {
									multipleValues: true,
								},
								required: true,
								description: "The IDs of the subnets associated with the task or service. All specified subnets must be from the same VPC.",
								default: {},
								options: [
								{
										name: "subnets",
										displayName: "Subnet",
										required: true,
										values: [
											{
												displayName: "Subnet ID",
												name: "subnet",
												type: "string",
												default: "",
												description: "The ID of the subnet",
											},
										],
									},
								],
							},
							{
								displayName: "Security Groups",
								name: "securityGroups",
								placeholder: "Add Security Group",
								type: "fixedCollection",
								typeOptions: {
									multipleValues: true,
								},
								description: "The IDs of the security groups associated with the task or service. If you don't specify a security group, the default security group for the VPC is used.",
								default: {},
								options: [
								{
										name: "securityGroups",
										displayName: "Security Group",
										values: [
											{
												displayName: "Security Group ID",
												name: "securityGroup",
												type: "string",
												default: "",
												description: "The ID of the security group",
											},
										],
									},
								],
							},
						],
					},
				],
			},
		],
	};

	// The function below is responsible for actually doing whatever this node
	// is supposed to do. In this case, we're just appending the `myString` property
	// with whatever the user has entered.
	// You can make async calls and use `await`.
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials: ICredentialDataDecryptedObject = await this.getCredentials('aws');
		const ecs = new AWS.ECS({
			accessKeyId: `${credentials.accessKeyId}`.trim(),
			secretAccessKey: `${credentials.secretAccessKey}`.trim(),
			region: `${credentials.region}`.trim(),
		});

		let item: INodeExecutionData;

		// Iterates over all input items and add the key "myString" with the
		// value the parameter "myString" resolves to.
		// (This could be a different value for each item in case it contains an expression)
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				item = items[itemIndex];

				if (operation === 'runTask') {
					const cluster = this.getNodeParameter('cluster', itemIndex) as string;
					const launchType = this.getNodeParameter('launchType', itemIndex) as string;
					const taskDefinition = this.getNodeParameter('taskDefinition', itemIndex) as string;
					const count = this.getNodeParameter('count', itemIndex) as number;
					const enableECSManagedTags = this.getNodeParameter('enableECSManagedTags', itemIndex) as boolean;
					const propagateTags = this.getNodeParameter('propagateTags', itemIndex) as string;
					const networkConfiguration = this.getNodeParameter('networkConfiguration', 0, {}) as IDataObject;

					if (networkConfiguration && networkConfiguration.awsvpcConfiguration) {
						const vpcConfig =  networkConfiguration.awsvpcConfiguration as IDataObject;
						const subnets =  vpcConfig.subnets as IDataObject;
						const securityGroups = vpcConfig.securityGroups as IDataObject;


						networkConfiguration.awsvpcConfiguration = {
							...vpcConfig,
							subnets: (subnets.subnets as IDataObject[] || []).map(({subnet}) => subnet),
							securityGroups: (securityGroups.securityGroups as IDataObject[] || []).map(({securityGroup}) => securityGroup),
						};
					}
					const params = {
						launchType,
						cluster,
						taskDefinition,
						count,
						enableECSManagedTags,
						propagateTags,
						networkConfiguration,
					};

					console.log(JSON.stringify(params, null, 2));

					const results = await ecs.runTask(params).promise();
					item.json = { ...results };
				}
			} catch (error) {
				// This node should never fail but we want to showcase how
				// to handle errors.
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property,
						// only append the itemIndex
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return this.prepareOutputData(items);
	}
}
