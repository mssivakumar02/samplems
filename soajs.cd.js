"use strict";

let gitRepo = null;
let gitOwner = null;
let gitBranch = null;
let ciProvider = null;
let gitCommit = null;

let authKey = process.env.SOAJS_CD_AUTH_KEY;
let deployToken = process.env.SOAJS_CD_DEPLOY_TOKEN;
let dashboardDomain = process.env.SOAJS_CD_DASHBOARD_DOMAIN;
let dashboardProtocol = process.env.SOAJS_CD_DASHBOARD_PROTOCOL || 'https';
let dashboardPort = process.env.SOAJS_CD_DASHBOARD_PORT || '443';
let dashboardAPIRoute = process.env.SOAJS_CD_API_ROUTE || '/cd/deploy';


let config = null;
let request = require("request");

let utils = {
	"init": (cb) => {
		console.log("Initializing CD script");
		//check the build environment - integration for scans
		if (process.env.TRAVIS) {
			console.log("Travis build environment detected");
			ciProvider = 'travis';
			
			if (!process.env.TRAVIS_REPO_SLUG || !process.env.TRAVIS_BRANCH) {
				console.log("Could not find Travis environment variables (Repo Slug | branch). Aborting");
				process.exit(0);
			}
			
			let repoSlug = process.env.TRAVIS_REPO_SLUG.split("/");
			gitOwner = repoSlug[0];
			gitRepo = repoSlug[1];
			gitBranch = process.env.TRAVIS_BRANCH.toLowerCase();
			gitCommit = process.env.TRAVIS_COMMIT;
		}
		else if (process.env.DRONE) {
			console.log("Drone build environment detected");
			ciProvider = 'drone';
			
			if (!process.env.DRONE_REPO_NAME || !process.env.DRONE_REPO_BRANCH) {
				console.log("Could not find Drone environment variables (Repo name | branch). Aborting");
				process.exit(0);
			}
			
			gitOwner = process.env.DRONE_REPO_OWNER.toLowerCase();
			gitRepo = process.env.DRONE_REPO_NAME.toLowerCase();
			gitBranch = process.env.DRONE_REPO_BRANCH.toLowerCase();
			gitCommit = process.env.DRONE_COMMIT;
		}
		else {
			console.log("Could not find any build environment. Aborting...");
			process.exit(0);
		}
		
		//Check if required envs are set
		console.log("Checking if required environment variables are set")
		//check auth env variables
		if (!authKey || !deployToken) {
			console.log("Error: Missing AUTH env variables. Aborting...");
			process.exit(0);
		}
		//check dashboard env variables
		if (!dashboardDomain || !dashboardAPIRoute) {
			console.log("Error: Missing DASHBOARD environment variables. Aborting...");
			process.exit(0);
		}
		
		console.log("Launching CD call...");
		utils.createRequest((params) => {
			console.log(params.uri);
			console.log(JSON.stringify(params.body, null, 2));
			request.post(params, cb);
		});
	},
	
	"createRequest": (cb) => {
		let params = {};
		
		params.uri = dashboardProtocol + "://" + dashboardDomain + ":" + dashboardPort + "/dashboard" + dashboardAPIRoute;
		
		params.qs = {
			deploy_token: deployToken
		};
		
		if (process.env.SOAJS_PROJECT) {
			params.qs.soajs_project = process.env.SOAJS_PROJECT;
		}
		
		params.headers = {
			"key": authKey,
			"Content-Type": "application/json"
		};
		
		params.json = true;
		
		try {
			config = require("./soa.js");
		}
		catch (e) {
			console.log("Could not find a soa.js file, searching for custom config file [config.js] ...");
			
			try {
				config = require('./config.js');
			}
			catch (e) {
				console.log("Could not find a config.js file, repo does contain a service code...");
			}
		}
		
		params.body = {
			"repo": gitRepo,
			"branch": gitBranch,
			"owner": gitOwner,
			"ciProvider": ciProvider,
			"commit": gitCommit
		};
		//if not a multi repo
		if (config && config.type && config.type !== "multi" && config.serviceName) {
			params.body.services = [{"serviceName": config.serviceName}];
			if (config.serviceVersion) {
				params.body.services[0].serviceVersion = config.serviceVersion;
				
			}
		}
		
		else if (config && config.type === "multi") {
			
			//loop over each service to add its
			let services = [];
			config.folders.forEach((service) => {
				let serviceConfigPath = "./" + service + "/config.js";
				let serviceConfig = require(serviceConfigPath);
				//construct each service option
				let oneService = {
					"serviceName": serviceConfig.serviceName
				};
				
				if (serviceConfig.serviceVersion) {
					oneService.serviceVersion = serviceConfig.serviceVersion;
				}
				services.push(oneService);
			});
			params.body.services = services;
		}
		return cb(params);
	}
};


utils.init((err, response, body) => {
	if (err) {
		console.log(JSON.stringify(err, null, 2));
	}
	else {
		console.log(JSON.stringify(body, null, 2));
	}
});
