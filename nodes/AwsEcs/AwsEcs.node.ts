import { IExecuteFunctions } from 'n8n-core';
import {
	ICredentialDataDecryptedObject,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { debuglog } from 'util';
import * as AWS from 'aws-sdk';

const debug = debuglog('n8n-nodes-aws-ecs');
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
						name: 'Describe Tasks',
						value: 'describeTasks',
						action: 'Describes a specified task or tasks',
					},
					{
						name: 'List Tasks',
						value: 'listTasks',
						action: 'Returns a list of tasks',
					},
					{
						name: 'Run Task',
						value: 'runTask',
						action: 'Starts a new task using the specified task definition',
					},
					{
						name: 'Stop Task',
						value: 'stopTask',
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
							'listTasks',
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
							'describeTasks',
							'listTasks',
							'runTask',
							'stopTask',
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
				displayName: 'Task',
				name: 'task',
				type: 'string',
				default: '',
				required: true,
				description: 'The task ID or full Amazon Resource Name (ARN) of the task to stop',
				displayOptions: {
					show: {
						operation: [
							'stopTask',
						],
					},
				},
			},
			{
				displayName: 'Reason',
				name: 'reason',
				type: 'string',
				default: '',
				description: 'An optional message specified when a task is stopped. For example, if you\'re using a custom scheduler, you can use this parameter to specify the reason for stopping the task here, and the message appears in subsequent DescribeTasks API operations on this task. Up to 255 characters are allowed in this message.',
				displayOptions: {
					show: {
						operation: [
							'stopTask',
						],
					},
				},
			},
			{
				displayName: 'Desired Status',
				name: 'desiredStatus',
				type: 'options',
				options: [
					{
						name: 'Pending',
						value: 'PENDING',
					},
					{
						name: 'Running',
						value: 'RUNNING',
					},
					{
						name: 'Stopped',
						value: 'STOPPED',
					},
				],
				default: 'RUNNING',
				description: 'The task desired status to use when filtering the ListTasks results. Specifying a desiredStatus of STOPPED limits the results to tasks that Amazon ECS has set the desired status to STOPPED. This can be useful for debugging tasks that aren\'t starting properly or have died or finished. The default status filter is RUNNING, which shows tasks that Amazon ECS has set the desired status to RUNNING.',
				displayOptions: {
					show: {
						operation: [
							'listTasks',
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
					numberStepSize: 1,
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
				description: "The network configuration for the task. This parameter is required for task definitions that use the awsvpc network mode to receive their own elastic network interface, and it isn't supported for other network modes.",
				default: {},
				displayOptions: {
					show: {
						operation: [
							'runTask',
						],
					},
				},
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
			{
				displayName: "Tasks",
				name: "tasks",
				placeholder: "Add Task",
				type: "fixedCollection",
				typeOptions: {
					multipleValues: true,
				},
				required: true,
				description: "A list of up to 100 task IDs or full ARN entries",
				default: {},
				displayOptions: {
					show: {
						operation: [
							'describeTasks',
						],
					},
				},
				options: [
				{
						name: "tasks",
						displayName: "Task",
						required: true,
						values: [
							{
								displayName: "Task ID",
								name: "task",
								type: "string",
								default: "",
								description: "The ID of the task",
							},
						],
					},
				],
			},
			{
				displayName: "Include",
				name: "include",
				placeholder: "Add Include",
				type: "fixedCollection",
				typeOptions: {
					multipleValues: true,
				},
				required: true,
				description: "A list of up to 100 task IDs or full ARN entries",
				default: {},
				displayOptions: {
					show: {
						operation: [
							'describeTasks',
						],
					},
				},
				options: [
				{
						name: "include",
						displayName: "Include",
						values: [
							{
								displayName: "Include",
								name: "include",
								type: "string",
								default: "",
								description: "The ID of the task",
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const credentials: ICredentialDataDecryptedObject = await this.getCredentials('aws');
		const ecs = new AWS.ECS({
			accessKeyId: `${credentials.accessKeyId}`.trim(),
			secretAccessKey: `${credentials.secretAccessKey}`.trim(),
			region: `${credentials.region}`.trim(),
		});

		let item: INodeExecutionData;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				item = items[itemIndex];

				if (operation === 'describeTasks') {
					const cluster = this.getNodeParameter('cluster', itemIndex) as string;
					const tasks = this.getNodeParameter('tasks', itemIndex, {}) as IDataObject;
					const include = this.getNodeParameter('include', itemIndex, {}) as IDataObject;
					const params: AWS.ECS.DescribeTasksRequest = {
						tasks: (tasks.tasks as IDataObject[] || []).map(({ task }) => task as string),
						include: (include.include as IDataObject[] || []).map(({ include }) => include as string),
					};

					if (cluster) {
						params.cluster = cluster;
					}

					debug(JSON.stringify(params, null, 2));
					const results = await ecs.describeTasks(params).promise();
					item.json = { ...results };
				} else if (operation === 'listTasks') {
					const cluster = this.getNodeParameter('cluster', itemIndex) as string;
					const launchType = this.getNodeParameter('launchType', itemIndex) as string;
					const desiredStatus = this.getNodeParameter('desiredStatus', itemIndex) as string;
					const params: AWS.ECS.ListTasksRequest = {
						launchType,
						desiredStatus,
					};

					if (cluster) {
						params.cluster = cluster;
					}

					debug(JSON.stringify(params, null, 2));
					const results = await ecs.listTasks(params).promise();
					item.json = { ...results };
				} else if (operation === 'runTask') {
					const cluster = this.getNodeParameter('cluster', itemIndex) as string;
					const launchType = this.getNodeParameter('launchType', itemIndex) as string;
					const taskDefinition = this.getNodeParameter('taskDefinition', itemIndex) as string;
					const count = this.getNodeParameter('count', itemIndex) as number;
					const enableECSManagedTags = this.getNodeParameter('enableECSManagedTags', itemIndex) as boolean;
					const propagateTags = this.getNodeParameter('propagateTags', itemIndex) as string;
					const networkConfiguration = this.getNodeParameter('networkConfiguration', itemIndex, {}) as IDataObject;

					if (networkConfiguration && networkConfiguration.awsvpcConfiguration) {
						const vpcConfig =  networkConfiguration.awsvpcConfiguration as IDataObject;
						const subnets =  vpcConfig.subnets as IDataObject;
						const securityGroups = vpcConfig.securityGroups as IDataObject;

						networkConfiguration.awsvpcConfiguration = {
							...vpcConfig,
							subnets: (subnets.subnets as IDataObject[] || []).map(({subnet}) => subnet as string),
							securityGroups: (securityGroups.securityGroups as IDataObject[] || []).map(({securityGroup}) => securityGroup as string),
						};
					}

					const params: AWS.ECS.RunTaskRequest = {
						launchType,
						taskDefinition,
						count,
						enableECSManagedTags,
						propagateTags,
						networkConfiguration,
					};

					if (cluster) {
						params.cluster = cluster;
					}

					debug(JSON.stringify(params, null, 2));

					const results = await ecs.runTask(params).promise();
					item.json = { ...results };
				} else if (operation === 'stopTask') {
					const cluster = this.getNodeParameter('cluster', itemIndex) as string;
					const task = this.getNodeParameter('task', itemIndex) as string;
					const reason = this.getNodeParameter('reason', itemIndex) as string;
					const params: AWS.ECS.StopTaskRequest = {
						task,
					};

					if (cluster) {
						params.cluster = cluster;
					}

					if (reason) {
						params.reason = reason;
					}

					debug(JSON.stringify(params, null, 2));
					const results = await ecs.stopTask(params).promise();
					item.json = { ...results };
				} else {
					throw new NodeOperationError(this.getNode(), `Operation "${operation}" not supported! `, {
						itemIndex,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					if (error.context) {
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
