export namespace github {
	
	export class CheckRun {
	    name: string;
	    status: string;
	    conclusion: string;
	    detailsUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new CheckRun(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.conclusion = source["conclusion"];
	        this.detailsUrl = source["detailsUrl"];
	    }
	}
	export class Client {
	
	
	    static createFrom(source: any = {}) {
	        return new Client(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class IssueComment {
	    id: string;
	    url: string;
	    author: string;
	    authorAvatar: string;
	    body: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new IssueComment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.author = source["author"];
	        this.authorAvatar = source["authorAvatar"];
	        this.body = source["body"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Label {
	    id: string;
	    name: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new Label(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	    }
	}
	export class ReviewComment {
	    id: string;
	    author: string;
	    authorAvatar: string;
	    body: string;
	    path: string;
	    line: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ReviewComment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.author = source["author"];
	        this.authorAvatar = source["authorAvatar"];
	        this.body = source["body"];
	        this.path = source["path"];
	        this.line = source["line"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReviewThread {
	    id: string;
	    url: string;
	    isResolved: boolean;
	    path: string;
	    line: number;
	    comments: ReviewComment[];
	
	    static createFrom(source: any = {}) {
	        return new ReviewThread(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.isResolved = source["isResolved"];
	        this.path = source["path"];
	        this.line = source["line"];
	        this.comments = this.convertValues(source["comments"], ReviewComment);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PRComments {
	    issueComments: IssueComment[];
	    reviewThreads: ReviewThread[];
	
	    static createFrom(source: any = {}) {
	        return new PRComments(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.issueComments = this.convertValues(source["issueComments"], IssueComment);
	        this.reviewThreads = this.convertValues(source["reviewThreads"], ReviewThread);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PageInfo {
	    hasNextPage: boolean;
	    endCursor: string;
	    totalCount: number;
	
	    static createFrom(source: any = {}) {
	        return new PageInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasNextPage = source["hasNextPage"];
	        this.endCursor = source["endCursor"];
	        this.totalCount = source["totalCount"];
	    }
	}
	export class Review {
	    id: string;
	    author: string;
	    authorAvatar: string;
	    state: string;
	    body: string;
	    // Go type: time
	    submittedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Review(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.author = source["author"];
	        this.authorAvatar = source["authorAvatar"];
	        this.state = source["state"];
	        this.body = source["body"];
	        this.submittedAt = this.convertValues(source["submittedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReviewRequest {
	    reviewer: string;
	    reviewerType: string;
	
	    static createFrom(source: any = {}) {
	        return new ReviewRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reviewer = source["reviewer"];
	        this.reviewerType = source["reviewerType"];
	    }
	}
	export class User {
	    nodeId: string;
	    login: string;
	    name: string;
	    avatarUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.login = source["login"];
	        this.name = source["name"];
	        this.avatarUrl = source["avatarUrl"];
	    }
	}
	export class PullRequest {
	    nodeId: string;
	    number: number;
	    url: string;
	    repoOwner: string;
	    repoName: string;
	    title: string;
	    body: string;
	    headRef: string;
	    baseRef: string;
	    state: string;
	    isDraft: boolean;
	    isInMergeQueue: boolean;
	    mergeable: string;
	    reviewDecision: string;
	    author: string;
	    authorAvatar: string;
	    additions: number;
	    deletions: number;
	    changedFiles: number;
	    commitCount: number;
	    assignees: User[];
	    reviewRequests: ReviewRequest[];
	    reviews: Review[];
	    labels: Label[];
	    checksStatus: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    // Go type: time
	    mergedAt?: any;
	    // Go type: time
	    closedAt?: any;
	    mergedBy: string;
	
	    static createFrom(source: any = {}) {
	        return new PullRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeId = source["nodeId"];
	        this.number = source["number"];
	        this.url = source["url"];
	        this.repoOwner = source["repoOwner"];
	        this.repoName = source["repoName"];
	        this.title = source["title"];
	        this.body = source["body"];
	        this.headRef = source["headRef"];
	        this.baseRef = source["baseRef"];
	        this.state = source["state"];
	        this.isDraft = source["isDraft"];
	        this.isInMergeQueue = source["isInMergeQueue"];
	        this.mergeable = source["mergeable"];
	        this.reviewDecision = source["reviewDecision"];
	        this.author = source["author"];
	        this.authorAvatar = source["authorAvatar"];
	        this.additions = source["additions"];
	        this.deletions = source["deletions"];
	        this.changedFiles = source["changedFiles"];
	        this.commitCount = source["commitCount"];
	        this.assignees = this.convertValues(source["assignees"], User);
	        this.reviewRequests = this.convertValues(source["reviewRequests"], ReviewRequest);
	        this.reviews = this.convertValues(source["reviews"], Review);
	        this.labels = this.convertValues(source["labels"], Label);
	        this.checksStatus = source["checksStatus"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.mergedAt = this.convertValues(source["mergedAt"], null);
	        this.closedAt = this.convertValues(source["closedAt"], null);
	        this.mergedBy = source["mergedBy"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PRPage {
	    pullRequests: PullRequest[];
	    pageInfo: PageInfo;
	
	    static createFrom(source: any = {}) {
	        return new PRPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pullRequests = this.convertValues(source["pullRequests"], PullRequest);
	        this.pageInfo = this.convertValues(source["pageInfo"], PageInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	
	
	export class Team {
	    slug: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new Team(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.slug = source["slug"];
	        this.name = source["name"];
	    }
	}
	
	export class ViewerInfo {
	    login: string;
	    name: string;
	    avatarUrl: string;
	    teams: Team[];
	
	    static createFrom(source: any = {}) {
	        return new ViewerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.login = source["login"];
	        this.name = source["name"];
	        this.avatarUrl = source["avatarUrl"];
	        this.teams = this.convertValues(source["teams"], Team);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace storage {
	
	export class MetricsSnapshot {
	    id: number;
	    // Go type: time
	    recordedAt: any;
	    openPRs: number;
	    pendingReviews: number;
	    teamReviews: number;
	    reviewedByMe: number;
	    merged14d: number;
	    avgMergeHours: number;
	    ciFailures: number;
	    conflicts: number;
	    stalePRs: number;
	    changesRequested: number;
	    totalAdditions: number;
	    totalDeletions: number;
	
	    static createFrom(source: any = {}) {
	        return new MetricsSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.recordedAt = this.convertValues(source["recordedAt"], null);
	        this.openPRs = source["openPRs"];
	        this.pendingReviews = source["pendingReviews"];
	        this.teamReviews = source["teamReviews"];
	        this.reviewedByMe = source["reviewedByMe"];
	        this.merged14d = source["merged14d"];
	        this.avgMergeHours = source["avgMergeHours"];
	        this.ciFailures = source["ciFailures"];
	        this.conflicts = source["conflicts"];
	        this.stalePRs = source["stalePRs"];
	        this.changesRequested = source["changesRequested"];
	        this.totalAdditions = source["totalAdditions"];
	        this.totalDeletions = source["totalDeletions"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReviewPriority {
	    id: number;
	    orgName: string;
	    name: string;
	    type: string;
	    priority: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ReviewPriority(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.orgName = source["orgName"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.priority = source["priority"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TrackedTeam {
	    orgName: string;
	    teamSlug: string;
	    teamName: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TrackedTeam(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.orgName = source["orgName"];
	        this.teamSlug = source["teamSlug"];
	        this.teamName = source["teamName"];
	        this.enabled = source["enabled"];
	    }
	}

}

